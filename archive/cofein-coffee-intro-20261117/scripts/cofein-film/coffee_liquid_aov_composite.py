"""Restore dry scenery behind near-floor coffee using two Cycles view layers.

The original constant-volume coffee shader remains connected unchanged. Two
surface AOVs describe coffee coverage and an artistic world-Z removal mask.
The compositor blends BOTH premultiplied RGB and alpha with a dry scene layer.
This is website-transition compositing, not physical absorption or a simulation.
No bake or render is started by this helper or its CLI.
"""
import argparse
import json
import math
from pathlib import Path
import sys

PREFIX = "CoffeeFloorAOV_"
OWNER = "cofein_dry_layer_floor_composite_v1"
COVERAGE = "CoffeeCoverage"
REMOVAL = "CoffeeFloorRemoval"
DRY_LAYER = "CoffeeDryScenery"
LIQUID_COLLECTION = "CoffeeAOVLiquid"


def _owned(nodes, suffix, kind):
    name = PREFIX + suffix
    node = nodes.get(name)
    if node and (node.bl_idname != kind or node.get("cofein_aov_owner") != OWNER):
        raise RuntimeError("Refusing to replace an unrelated node: " + name)
    if node is None:
        node = nodes.new(kind)
        node.name = name
        node.label = suffix
        node["cofein_aov_owner"] = OWNER
    return node


def _layer_collection(layer, collection):
    def visit(node):
        if node.collection == collection:
            return node
        for child in node.children:
            found = visit(child)
            if found:
                return found
        return None
    return visit(layer.layer_collection)


def _math(nodes, links, suffix, operation, first, second):
    node = _owned(nodes, suffix, "CompositorNodeMath")
    node.operation = operation
    for index, value in enumerate((first, second)):
        if isinstance(value, (int, float)):
            for link in list(node.inputs[index].links):
                links.remove(link)
            node.inputs[index].default_value = value
        else:
            links.new(value, node.inputs[index])
    return node.outputs[0]


def configure_liquid_aov_composite(scene=None, material=None, *, floor_z=0.,
                                   fade_start=.0005, fade_end=.008, dry_samples=8):
    import bpy
    scene = scene or bpy.context.scene
    material = material or bpy.data.materials.get("CoffeeMaterial")
    if not all(math.isfinite(v) for v in (floor_z, fade_start, fade_end)) or fade_end <= fade_start:
        raise ValueError("Finite, increasing floor-fade bounds required")
    if dry_samples < 1:
        raise ValueError("Dry layer samples must be positive")
    if scene.render.engine != "CYCLES":
        raise RuntimeError("The AOV compositor requires Cycles")
    if not material or not material.use_nodes:
        raise RuntimeError("Expected a node-based CoffeeMaterial")
    nodes, links = material.node_tree.nodes, material.node_tree.links
    if any(n.name.startswith("CoffeeFloorComposite_") for n in nodes):
        raise RuntimeError("Load the original constant-volume render-ready material; heterogeneous floor-fade nodes remain")
    output = next((n for n in nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None)
    if not output or not output.inputs["Surface"].is_linked or not output.inputs["Volume"].is_linked:
        raise RuntimeError("Coffee must retain its original surface and volume outputs")
    absorption = [n for n in nodes if n.type == "VOLUME_ABSORPTION"]
    if not absorption or any(n.inputs["Density"].is_linked for n in absorption):
        raise RuntimeError("This variant requires original constant absorption density")

    previous = json.loads(scene.get("cofein_floor_aov_composite", "null"))
    beauty_name = previous["beautyLayer"] if previous else bpy.context.view_layer.name
    beauty = scene.view_layers.get(beauty_name)
    if beauty is None or beauty.name == DRY_LAYER:
        raise RuntimeError("Expected a separate existing beauty view layer")
    dry = scene.view_layers.get(DRY_LAYER)
    if dry and not previous:
        raise RuntimeError("Refusing to reuse an unrelated dry view layer")
    if dry is None:
        dry = scene.view_layers.new(DRY_LAYER)
        # Copy collection exclusion/holdout state, then hide only the coffee.
        def copy_state(src, dst):
            dst.exclude, dst.holdout = src.exclude, src.holdout
            dst.indirect_only, dst.hide_viewport = src.indirect_only, src.hide_viewport
            for child in dst.children:
                origin = next((c for c in src.children if c.collection == child.collection), None)
                if origin:
                    copy_state(origin, child)
        copy_state(beauty.layer_collection, dry.layer_collection)
    dry.use = True
    dry.samples = dry_samples
    dry.cycles.use_denoising = beauty.cycles.use_denoising

    collection = bpy.data.collections.get(LIQUID_COLLECTION)
    if collection and collection.get("cofein_aov_owner") != OWNER:
        raise RuntimeError("Refusing to reuse an unrelated coffee collection")
    if collection is None:
        collection = bpy.data.collections.new(LIQUID_COLLECTION)
        collection["cofein_aov_owner"] = OWNER
        scene.collection.children.link(collection)
    objects = [obj for obj in scene.objects if any(slot.material == material for slot in obj.material_slots)]
    if not objects:
        raise RuntimeError("No coffee objects found in this scene")
    for obj in objects:
        if "cofein_aov_original_collections" not in obj:
            obj["cofein_aov_original_collections"] = json.dumps([c.name for c in obj.users_collection])
        if obj.name not in collection.objects:
            collection.objects.link(obj)
        for old_collection in list(obj.users_collection):
            if old_collection != collection:
                old_collection.objects.unlink(obj)
    bpy.context.view_layer.update()
    _layer_collection(beauty, collection).exclude = False
    _layer_collection(dry, collection).exclude = True

    for name in (COVERAGE, REMOVAL):
        aov = beauty.aovs.get(name)
        if aov and not previous:
            raise RuntimeError("Refusing to reuse an unrelated AOV: " + name)
        if aov is None:
            aov = beauty.aovs.add()
            aov.name = name
        aov.type = "VALUE"
    position = _owned(nodes, "WorldPosition", "ShaderNodeNewGeometry")
    split = _owned(nodes, "WorldXYZ", "ShaderNodeSeparateXYZ")
    fade = _owned(nodes, "Removal", "ShaderNodeMapRange")
    fade.data_type, fade.interpolation_type, fade.clamp = "FLOAT", "SMOOTHSTEP", True
    fade.inputs["From Min"].default_value = floor_z + fade_start
    fade.inputs["From Max"].default_value = floor_z + fade_end
    fade.inputs["To Min"].default_value = 1.
    fade.inputs["To Max"].default_value = 0.
    coverage = _owned(nodes, "CoverageOutput", "ShaderNodeOutputAOV")
    removal = _owned(nodes, "RemovalOutput", "ShaderNodeOutputAOV")
    # AOV outputs use their name property as the pass identifier, so track
    # ownership independently and recover the same nodes on repeated calls.
    coverage.aov_name = COVERAGE
    removal.aov_name = REMOVAL
    coverage.inputs["Value"].default_value = 1.
    links.new(position.outputs["Position"], split.inputs["Vector"])
    links.new(split.outputs["Z"], fade.inputs["Value"])
    links.new(fade.outputs["Result"], removal.inputs["Value"])

    scene.use_nodes = True
    cn, cl = scene.node_tree.nodes, scene.node_tree.links
    composites = [n for n in cn if n.type == "COMPOSITE"]
    if len(composites) > 1:
        raise RuntimeError("Expected a single compositor output")
    composite = composites[0] if composites else _owned(cn, "Composite", "CompositorNodeComposite")
    if composite.inputs["Image"].is_linked and not previous:
        original = composite.inputs["Image"].links[0].from_node
        while original.bl_idname == "NodeReroute" and original.inputs[0].is_linked:
            original = original.inputs[0].links[0].from_node
        if original.bl_idname != "CompositorNodeRLayers":
            raise RuntimeError("Custom compositor detected; integrate the AOV blend explicitly")
    beauty_node = _owned(cn, "Beauty", "CompositorNodeRLayers")
    dry_node = _owned(cn, "DryScenery", "CompositorNodeRLayers")
    beauty_node.layer, dry_node.layer = beauty.name, dry.name
    bpy.context.view_layer.update()
    if COVERAGE not in beauty_node.outputs or REMOVAL not in beauty_node.outputs:
        raise RuntimeError("Cycles AOV outputs are not available on the beauty render layer")
    denominator = _math(cn, cl, "CoverageFloor", "MAXIMUM", beauty_node.outputs[COVERAGE], 1e-6)
    mask = _math(cn, cl, "NormalizedRemoval", "DIVIDE", beauty_node.outputs[REMOVAL], denominator)
    mask.node.use_clamp = True
    keep = _math(cn, cl, "KeepBeauty", "SUBTRACT", 1., mask)
    mix = _owned(cn, "PremultipliedRGB", "CompositorNodeMixRGB")
    mix.blend_type, mix.use_alpha, mix.use_clamp = "MIX", False, False
    cl.new(mask, mix.inputs[0])
    cl.new(beauty_node.outputs["Image"], mix.inputs[1])
    cl.new(dry_node.outputs["Image"], mix.inputs[2])
    alpha_beauty = _math(cn, cl, "BeautyAlpha", "MULTIPLY", beauty_node.outputs["Alpha"], keep)
    alpha_dry = _math(cn, cl, "DryAlpha", "MULTIPLY", dry_node.outputs["Alpha"], mask)
    alpha = _math(cn, cl, "CombinedAlpha", "ADD", alpha_beauty, alpha_dry)
    set_alpha = _owned(cn, "PremultipliedRGBA", "CompositorNodeSetAlpha")
    set_alpha.mode = "REPLACE_ALPHA"
    cl.new(mix.outputs["Image"], set_alpha.inputs["Image"])
    cl.new(alpha, set_alpha.inputs["Alpha"])
    cl.new(set_alpha.outputs["Image"], composite.inputs["Image"])

    metadata = dict(version=1, owner=OWNER, beautyLayer=beauty.name, dryLayer=dry.name,
                    drySamples=dry_samples, material=material.name,
                    liquidObjects=sorted(obj.name for obj in objects),
                    floorZ=floor_z, fadeStartAboveFloorM=fade_start, fadeEndAboveFloorM=fade_end,
                    aovs=[COVERAGE, REMOVAL], coverageNormalized=True,
                    blend="premultiplied beauty RGBA*(1-mask) + dry RGBA*mask",
                    originalSurfaceAndVolumePreserved=True, constantVolumeDensityPreserved=True,
                    simulationChanged=False, trajectoriesChanged=False, physicalContactsChanged=False,
                    physicalAbsorptionModel=False,
                    purpose="Artistic website reveal; dry scenery restores pixels behind removed near-floor coffee",
                    limitations=["Dry view layer incurs an additional low-sample Cycles render",
                                 "Visible-surface AOV blending is not physical volumetric absorption",
                                 "Reflections/refraction and shadows at the transition are composited, not re-simulated",
                                 "Shadow-catcher or indirect effects outside visible coffee are not removed by this surface AOV"])
    scene["cofein_floor_aov_composite"] = json.dumps(metadata)
    return metadata


def main():
    import bpy
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--dry-samples", type=int, default=8)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.input).resolve()))
    report = configure_liquid_aov_composite(dry_samples=args.dry_samples)
    target = Path(args.output).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(target))
    target.with_suffix(".aov-composite.json").write_text(json.dumps(report, indent=2) + "\n")
    print("COFFEE_AOV_COMPOSITE_READY", json.dumps(report), flush=True)


if __name__ == "__main__":
    main()

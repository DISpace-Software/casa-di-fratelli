#!/usr/bin/env python3
"""Guard extracted domain boundaries without claiming to validate all legacy code.

This lightweight source check complements compilation and behavior tests. It checks
imports, not fully qualified calls or runtime dependency injection. Keep exceptions
specific and explained; do not exempt an entire layer to make a build pass.
"""
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
errors = []
checked = 0


def violation(path, message):
    errors.append(f'{path.relative_to(ROOT)}: {message}')


def inside(path, directory):
    return path.resolve().is_relative_to(directory.resolve())


def check_client_domain(directory, suffix, import_pattern, allowed_packages=()):
    global checked
    for path in directory.rglob(f'*{suffix}'):
        if '__tests__' in path.parts:
            continue
        checked += 1
        for match in re.finditer(import_pattern, path.read_text(), re.MULTILINE):
            dependency = match.group(1)
            if dependency.startswith('.'):
                if not inside(path.parent / dependency, directory):
                    violation(path, f'domain depends on outer layer: {dependency}')
            elif dependency.startswith('dart:'):
                if dependency in ('dart:io', 'dart:html'):
                    violation(path, f'domain performs platform I/O: {dependency}')
                if dependency == 'dart:ui' and path.name != 'cofein_geometry.dart':
                    violation(path, 'dart:ui is reserved for the existing map geometry adapter')
            elif suffix == '.dart' and ':' not in dependency:
                if not inside(path.parent / dependency, directory):
                    violation(path, f'domain depends on outer layer: {dependency}')
            elif not any(dependency.startswith(p) for p in allowed_packages):
                violation(path, f'unapproved domain dependency: {dependency}')


check_client_domain(
    ROOT / 'frontend/src/domain', '.js',
    r"(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*)['\"]([^'\"]+)['\"]",
)
check_client_domain(
    ROOT / 'mobile/lib/domain', '.dart',
    r"^\s*(?:import|export)\s+['\"]([^'\"]+)['\"]",
    allowed_packages=('package:timezone/', 'package:seatmap_mobile/domain/'),
)

# This project intentionally uses only BCL types. EF mappings and HTTP contracts
# belong to adapters; introducing an external package here needs explicit review.
domain = ROOT / 'backend/SeatMap.Domain'
if not domain.exists():
    violation(domain, "required domain project is missing")
else:
    for project in domain.glob('*.csproj'):
        tree = ET.parse(project)
        for element in tree.iter():
            if element.tag in ('ProjectReference', 'PackageReference'):
                violation(project, f'domain must remain dependency-free: {element.attrib.get("Include")}')
    for path in domain.rglob('*.cs'):
        if {'obj', 'bin'} & set(path.parts):
            continue
        checked += 1
        for namespace in re.findall(r'^\s*(?:global\s+)?using\s+(?:static\s+)?([^;]+);', path.read_text(), re.MULTILINE):
            if re.search(r'Microsoft\.(?:AspNetCore|EntityFrameworkCore)|SeatMap\.Api|Npgsql', namespace):
                violation(path, f'domain depends on adapter: {namespace}')

# Local web module cycles are especially easy to introduce when extracting a
# large component. Follow static relative imports/re-exports; external packages
# and dynamic imports remain the bundler/runtime checks' responsibility.
web = ROOT / 'frontend/src'
graph = {}
for path in web.rglob('*'):
    if path.suffix not in ('.js', '.jsx') or '__tests__' in path.parts:
        continue
    dependencies = []
    pattern = r"(?:\bfrom\s*|^\s*import\s*)['\"](\.[^'\"]+)['\"]"
    for dependency in re.findall(pattern, path.read_text(), re.MULTILINE):
        base = (path.parent / dependency).resolve()
        candidates = (base, base.with_suffix('.js'), base.with_suffix('.jsx'),
                      base / 'index.js', base / 'index.jsx')
        resolved = next((candidate for candidate in candidates if candidate.is_file()), None)
        if resolved is not None:
            dependencies.append(resolved)
    graph[path] = dependencies

# Applications own their presentation. Shared modules cannot depend on an app,
# and restaurant sites cannot import each other's implementation. Casa retains
# one explicit legacy lazy admin route until that compatibility route is retired.
apps = web / 'apps'
for path in graph:
    pattern = r"(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*)['\"](\.[^'\"]+)['\"]"
    for dependency in re.findall(pattern, path.read_text(), re.MULTILINE):
        base = (path.parent / dependency).resolve()
        target = next((p for p in (base, Path(str(base) + '.js'), Path(str(base) + '.jsx')) if p.is_file()), None)
        if target is None or not inside(target, apps):
            continue
        if not inside(path, apps):
            violation(path, f'shared code imports an application: {dependency}')
            continue
        owner = path.relative_to(apps).parts[0]
        target_owner = target.relative_to(apps).parts[0]
        legacy_admin = path == apps / 'casa/App.jsx' and target == apps / 'admin/AdminPage.jsx'
        if owner != target_owner and not legacy_admin:
            violation(path, f'application imports another application: {dependency}')

visited, active = set(), []


def visit(path):
    if path in active:
        cycle = active[active.index(path):] + [path]
        violation(path, 'local module cycle: ' + ' -> '.join(str(p.relative_to(ROOT)) for p in cycle))
        return
    if path in visited:
        return
    active.append(path)
    for dependency in graph.get(path, []):
        visit(dependency)
    active.pop()
    visited.add(path)


for path in graph:
    visit(path)

if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)
print(f'Architecture boundaries passed ({checked} domain source files; {len(graph)} web modules checked for cycles).')

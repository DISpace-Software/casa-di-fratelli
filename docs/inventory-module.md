# Inventory Module

## Current Capabilities

The project already supports:

- inventory items;
- recipe lines per menu item;
- dining order inventory extras;
- stock movements;
- audits and audit lines;
- low stock visibility;
- automatic consumption after paid/completed orders;
- duplicate consumption protection via `DiningOrder.InventoryConsumedAtUtc`.

## Important Business Rule

Inventory should be deducted only once per order. If an order is already consumed, the system must not deduct again.

## Movement Types

Supported/target movement types:

- `Receipt`
- `SaleConsumption`
- `ManualAdjustment`
- `InventoryCorrection`
- `Waste`

## Recipe Extras

SeatMap needs to support restaurant reality:

- double alcohol in cocktails;
- extra cheese;
- removed ingredients;
- kitchen notes;
- guest-specific additions.

The current `DiningOrderItemInventoryExtra` direction is correct and should be expanded into a clear modifier model later.

## Recommended Next Improvements

- Add recipe versioning so historic order costing remains stable.
- Add supplier receipts and purchase prices.
- Add waste reasons.
- Add audit export.
- Add variance reports by ingredient/category.
- Add stock forecast based on menu sales.


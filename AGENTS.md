# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Prototype design preference: Do not represent NAS health with a broken or missing segment in the gauge arc. Use a clean, continuous health indicator and show the numeric score/status in text.

Prototype visual target: Match the supplied 720P landscape NAS dashboard reference as the source of truth for density, three-column layout, top status bar, bottom navigation, card proportions, and real-device screenshots. Android 7 phone screenshots must be compared against the reference after APK builds.

Current UI direction: The final reference image supplied on 2026-06-27 is the visual source of truth. The interface language standard is Simplified Chinese; English should only remain for product/protocol names such as Atlas NAS, Docker, SMB/CIFS, LAN, Pool 1, HDD, RAID, CPU, and units.

Hardware page preference: The device information card should use the realistic Atlas NAS product image asset instead of a generic line icon, with no separate inner frame around the image, a subtle dark floor shadow only, and no duplicate ATLAS label overlay.

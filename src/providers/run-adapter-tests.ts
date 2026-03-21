/**
 * Provider Adapter Test Runner
 *
 * Runs all adapter mapping tests and reports results.
 * Execute with: npx tsx src/providers/run-adapter-tests.ts
 *
 * Each adapter test validates that provider-specific payloads are correctly
 * normalized into canonical Sentinel facts per the write path:
 *   Provider payload -> raw_artifacts -> fact_assertions -> dossier
 */

async function main() {
  console.log("=== Sentinel Provider Adapter Mapping Tests ===\n");

  const adapters = [
    { name: "PropertyRadar", path: "./propertyradar/adapter.test" },
    { name: "ATTOM", path: "./attom/adapter.test" },
    { name: "Regrid", path: "./regrid/adapter.test" },
    { name: "Bricked AI", path: "./bricked/adapter.test" },
  ];

  let totalPass = 0;
  let totalFail = 0;
  const failures: { adapter: string; errors: string[] }[] = [];

  for (const adapter of adapters) {
    console.log(`[${adapter.name}]`);
    try {
      const mod = await import(adapter.path);
      const result = await mod.validate();

      if (result.pass) {
        totalPass++;
        console.log(`  -> ALL PASSED\n`);
      } else {
        totalFail++;
        failures.push({ adapter: adapter.name, errors: result.errors });
        console.log(`  -> ${result.errors.length} FAILURE(S)\n`);
      }
    } catch (e) {
      totalFail++;
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({ adapter: adapter.name, errors: [msg] });
      console.error(`  -> IMPORT/SETUP ERROR: ${msg}\n`);
    }
  }

  // Summary
  console.log("=== Summary ===");
  console.log(`Adapters passed: ${totalPass}/${adapters.length}`);
  console.log(`Adapters failed: ${totalFail}/${adapters.length}`);

  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  ${f.adapter}:`);
      for (const err of f.errors) {
        console.log(`    - ${err}`);
      }
    }
    process.exit(1);
  } else {
    console.log("\nAll adapter mapping tests passed.");
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("Test runner crashed:", e);
  process.exit(1);
});

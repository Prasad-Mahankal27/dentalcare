const {
  PLAN_LIMITS,
  evaluateSubscriptionFromPlan
} = require("../subscription/service");

function runCase(caseName, input, expectation) {
  const result = evaluateSubscriptionFromPlan(input);

  const checks = [
    {
      label: "effectivePlan",
      pass: expectation.effectivePlan === undefined || result.effectivePlan === expectation.effectivePlan,
      expected: expectation.effectivePlan,
      actual: result.effectivePlan
    },
    {
      label: "outOfLimit",
      pass: expectation.outOfLimit === undefined || result.outOfLimit === expectation.outOfLimit,
      expected: expectation.outOfLimit,
      actual: result.outOfLimit
    },
    {
      label: "reasonIncludes",
      pass:
        !Array.isArray(expectation.reasonIncludes) ||
        expectation.reasonIncludes.every((reason) => result.reasonCodes.includes(reason)),
      expected: expectation.reasonIncludes,
      actual: result.reasonCodes
    },
    {
      label: "reasonExcludes",
      pass:
        !Array.isArray(expectation.reasonExcludes) ||
        expectation.reasonExcludes.every((reason) => !result.reasonCodes.includes(reason)),
      expected: expectation.reasonExcludes,
      actual: result.reasonCodes
    }
  ];

  const failedChecks = checks.filter((check) => !check.pass);
  return {
    caseName,
    input,
    result,
    pass: failedChecks.length === 0,
    failedChecks
  };
}

function buildPlanBoundaryCases(plan) {
  const limits = PLAN_LIMITS[plan];
  const baseUsage = {
    doctors: 0,
    receptionists: 0,
    patients: 0
  };

  const cases = [];

  if (Number.isFinite(limits.doctors)) {
    cases.push(
      {
        caseName: `${plan}: doctors at limit`,
        input: {
          plan,
          duration: null,
          planStartedAt: null,
          usage: { ...baseUsage, doctors: limits.doctors }
        },
        expectation: {
          effectivePlan: plan,
          outOfLimit: false,
          reasonExcludes: ["DOCTOR_LIMIT_EXCEEDED"]
        }
      },
      {
        caseName: `${plan}: doctors over limit`,
        input: {
          plan,
          duration: null,
          planStartedAt: null,
          usage: { ...baseUsage, doctors: limits.doctors + 1 }
        },
        expectation: {
          effectivePlan: plan,
          outOfLimit: true,
          reasonIncludes: ["DOCTOR_LIMIT_EXCEEDED"]
        }
      }
    );
  }

  if (Number.isFinite(limits.receptionists)) {
    cases.push(
      {
        caseName: `${plan}: receptionists at limit`,
        input: {
          plan,
          duration: null,
          planStartedAt: null,
          usage: { ...baseUsage, receptionists: limits.receptionists }
        },
        expectation: {
          effectivePlan: plan,
          outOfLimit: false,
          reasonExcludes: ["RECEPTIONIST_LIMIT_EXCEEDED"]
        }
      },
      {
        caseName: `${plan}: receptionists over limit`,
        input: {
          plan,
          duration: null,
          planStartedAt: null,
          usage: { ...baseUsage, receptionists: limits.receptionists + 1 }
        },
        expectation: {
          effectivePlan: plan,
          outOfLimit: true,
          reasonIncludes: ["RECEPTIONIST_LIMIT_EXCEEDED"]
        }
      }
    );
  }

  if (Number.isFinite(limits.patients)) {
    cases.push(
      {
        caseName: `${plan}: patients at limit`,
        input: {
          plan,
          duration: null,
          planStartedAt: null,
          usage: { ...baseUsage, patients: limits.patients }
        },
        expectation: {
          effectivePlan: plan,
          outOfLimit: false,
          reasonExcludes: ["PATIENT_LIMIT_EXCEEDED"]
        }
      },
      {
        caseName: `${plan}: patients over limit`,
        input: {
          plan,
          duration: null,
          planStartedAt: null,
          usage: { ...baseUsage, patients: limits.patients + 1 }
        },
        expectation: {
          effectivePlan: plan,
          outOfLimit: true,
          reasonIncludes: ["PATIENT_LIMIT_EXCEEDED"]
        }
      }
    );
  } else {
    cases.push({
      caseName: `${plan}: patients unbounded`,
      input: {
        plan,
        duration: null,
        planStartedAt: null,
        usage: { ...baseUsage, patients: 1000000 }
      },
      expectation: {
        effectivePlan: plan,
        outOfLimit: false,
        reasonExcludes: ["PATIENT_LIMIT_EXCEEDED"]
      }
    });
  }

  return cases;
}

function buildDurationCases() {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  return [
    {
      caseName: "duration: 3m still active at 89 days",
      input: {
        plan: "pro",
        duration: "3m",
        planStartedAt: new Date(now - 89 * dayMs),
        usage: { doctors: 0, receptionists: 0, patients: 0 },
        nowMs: now
      },
      expectation: {
        effectivePlan: "pro",
        outOfLimit: false,
        reasonExcludes: ["PLAN_EXPIRED"]
      }
    },
    {
      caseName: "duration: 3m expires at 91 days",
      input: {
        plan: "pro",
        duration: "3m",
        planStartedAt: new Date(now - 91 * dayMs),
        usage: { doctors: 0, receptionists: 0, patients: 0 },
        nowMs: now
      },
      expectation: {
        effectivePlan: "expired",
        outOfLimit: true,
        reasonIncludes: ["PLAN_EXPIRED"]
      }
    }
  ];
}

function main() {
  const matrix = [
    ...buildPlanBoundaryCases("free"),
    ...buildPlanBoundaryCases("lite"),
    ...buildPlanBoundaryCases("pro"),
    ...buildDurationCases()
  ];

  const results = matrix.map((entry) => runCase(entry.caseName, entry.input, entry.expectation));
  const passed = results.filter((result) => result.pass);
  const failed = results.filter((result) => !result.pass);

  console.log("\nSubscription Boundary Matrix\n");
  for (const result of results) {
    const mark = result.pass ? "PASS" : "FAIL";
    console.log(`${mark}  ${result.caseName}`);

    if (!result.pass) {
      for (const check of result.failedChecks) {
        console.log(`  - ${check.label} expected=${JSON.stringify(check.expected)} actual=${JSON.stringify(check.actual)}`);
      }
    }
  }

  console.log(`\nSummary: ${passed.length}/${results.length} cases passed`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();

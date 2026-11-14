/**
 * Public Model Template Library & Open Model Sharing Ecosystem
 *
 * Provides battle-tested system dynamics templates for NGOs, foundations,
 * and social enterprises to achieve immediate zero-touch time-to-value.
 *
 * Licensed under Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0).
 */

export const PUBLIC_MODEL_TEMPLATES = [
  {
    id: "disaster_relief_surge",
    title: "Emergency Disaster Relief & Surge Logistics",
    category: "Disaster Response",
    sector: "Humanitarian & Disaster Relief",
    summary: "Models emergency supply warehousing, volunteer deployment speed, response lead-time delays, and relief delivery throughput.",
    description: "Designed for disaster relief operations (such as food distribution, shelter, and medical kits). Captures supply buffer stocks, volunteer turnover dynamics, distribution capacity limits, and population survival outcomes.",
    attribution: "Humanitarian Systems Alliance (CC BY-SA 4.0)",
    tags: ["Humanitarian", "Logistics", "Emergency", "Surge Capacity"],
    nodes: [
      {
        symbol: "suppliesStock",
        name: "Emergency Supplies Stock",
        unit: "rations",
        initialValue: 10000,
        formula: "delay(suppliesStock, 1) + inboundShipments - rationsDistributed",
        costCategory: "operational",
        isEstimate: false,
        notes: "Warehouse inventory buffer stock"
      },
      {
        symbol: "inboundShipments",
        name: "Inbound Supply Shipments",
        unit: "rations/day",
        initialValue: 1500,
        formula: "1500",
        costCategory: "operational",
        isEstimate: false,
        notes: "Baseline replenishment rate from regional hub"
      },
      {
        symbol: "volunteerReserves",
        name: "Active Relief Volunteers",
        unit: "people",
        initialValue: 200,
        formula: "delay(volunteerReserves, 1) + newRecruits - volunteerChurn",
        costCategory: "direct_program",
        isEstimate: false,
        notes: "On-the-ground volunteer headcount"
      },
      {
        symbol: "newRecruits",
        name: "Daily Volunteer Recruitment",
        unit: "people/day",
        initialValue: 15,
        formula: "15",
        costCategory: "direct_program",
        isEstimate: true,
        notes: "Community volunteer mobilization"
      },
      {
        symbol: "volunteerChurn",
        name: "Daily Volunteer Churn",
        unit: "people/day",
        initialValue: 10,
        formula: "volunteerReserves * 0.05",
        costCategory: "overhead",
        isEstimate: false,
        notes: "Fatigue and rotation rate"
      },
      {
        symbol: "distributionCapacity",
        name: "Daily Distribution Capacity",
        unit: "rations/day",
        initialValue: 3000,
        formula: "volunteerReserves * 25",
        costCategory: "direct_program",
        isEstimate: false,
        notes: "Throughput potential constrained by staffing"
      },
      {
        symbol: "rationsDistributed",
        name: "Actual Rations Distributed",
        unit: "rations/day",
        initialValue: 2000,
        formula: "min(distributionCapacity, suppliesStock)",
        costCategory: "social_benefit",
        isEstimate: false,
        notes: "Effective relief reaching affected families"
      },
      {
        symbol: "communityReliefRate",
        name: "Community Relief Coverage",
        unit: "%",
        initialValue: 75,
        formula: "min(100, (rationsDistributed / 2500) * 100)",
        costCategory: "social_benefit",
        isEstimate: false,
        notes: "Percentage of target community receiving adequate sustenance"
      }
    ],
    sampleActions: [
      {
        title: "Pre-Position Regional Hub Inventory",
        estSpending: 8000,
        estEffortHrs: 40,
        outstandingDirectCosts: 8000,
        impacts: [
          { symbol: "inboundShipments", operation: "+", operand: 1000, duration: "forever" }
        ],
        notes: "Increases supply replenishment speed and buffers against logistical bottlenecks."
      },
      {
        title: "Volunteer Retention & Well-Being Support",
        estSpending: 2500,
        estEffortHrs: 30,
        outstandingDirectCosts: 2500,
        impacts: [
          { symbol: "newRecruits", operation: "+", operand: 10, duration: "forever" }
        ],
        notes: "Expands volunteer recruitment and mitigates exhaustion turnover."
      }
    ]
  },
  {
    id: "community_healthcare_clinic",
    title: "Community Preventative Care & Mobile Health",
    category: "Public Health",
    sector: "Public Health & Primary Care",
    summary: "Traces early screening, mobile clinic reach, hospital bed decongestion, and quality-adjusted healthy life years.",
    description: "Models primary care interventions in underserved regions. Simulates how preventative diagnostic screenings reduce downstream emergency hospitalization costs and elevate population well-being.",
    attribution: "Global Health Systems Collaborative (CC BY-SA 4.0)",
    tags: ["Healthcare", "Preventative Care", "Public Health", "SDGs"],
    nodes: [
      {
        symbol: "mobileClinics",
        name: "Operating Mobile Clinics",
        unit: "vans",
        initialValue: 4,
        formula: "4",
        costCategory: "capital",
        isEstimate: false,
        notes: "Equipped diagnostic vehicles"
      },
      {
        symbol: "screeningsConducted",
        name: "Monthly Diagnostic Screenings",
        unit: "patients/mo",
        initialValue: 1200,
        formula: "mobileClinics * 300",
        costCategory: "direct_program",
        isEstimate: false,
        notes: "Routine blood pressure, diabetes, and infectious disease checks"
      },
      {
        symbol: "earlyDetections",
        name: "Early-Stage Diagnoses",
        unit: "cases/mo",
        initialValue: 144,
        formula: "screeningsConducted * 0.12",
        costCategory: "social_benefit",
        isEstimate: false,
        notes: "Conditions identified before critical complications"
      },
      {
        symbol: "emergencyAdmissionsAvoided",
        name: "Emergency Admissions Avoided",
        unit: "admissions/mo",
        initialValue: 50,
        formula: "earlyDetections * 0.35",
        costCategory: "social_benefit",
        isEstimate: false,
        notes: "Reduced hospital burden due to early intervention"
      },
      {
        symbol: "healthyLifeYearsSaved",
        name: "Healthy Life Years Preserved",
        unit: "QALYs/yr",
        initialValue: 180,
        formula: "emergencyAdmissionsAvoided * 3.6",
        costCategory: "social_benefit",
        isEstimate: false,
        notes: "Quality-adjusted life years gained through prevention"
      }
    ],
    sampleActions: [
      {
        title: "Deploy 2 Additional Rural Mobile Vans",
        estSpending: 12000,
        estEffortHrs: 100,
        outstandingDirectCosts: 12000,
        impacts: [
          { symbol: "mobileClinics", operation: "+", operand: 2, duration: "forever" }
        ],
        notes: "Expands physical fleet to reach remote mountain villages."
      },
      {
        title: "Community Health Worker Screening Training",
        estSpending: 3000,
        estEffortHrs: 50,
        outstandingDirectCosts: 3000,
        impacts: [
          { symbol: "screeningsConducted", operation: "+", operand: 400, duration: "forever" }
        ],
        notes: "Trains local residents to perform basic diagnostic checkups."
      }
    ]
  },
  {
    id: "education_digital_literacy",
    title: "Digital Literacy & Community Empowerment",
    category: "Education",
    sector: "Education & Workforce Development",
    summary: "Tracks trained teachers, student graduation, digital skills proficiency, and local household income gains.",
    description: "Models youth skill development and vocational training. Connects teacher quality and lab access to student career outcomes and intergenerational economic mobility.",
    attribution: "Inclusive Education Network (CC BY-SA 4.0)",
    tags: ["Education", "Youth", "Digital Inclusion", "Economic Mobility"],
    nodes: [
      {
        symbol: "certifiedEducators",
        name: "Certified STEM Educators",
        unit: "teachers",
        initialValue: 30,
        formula: "30",
        costCategory: "direct_program",
        isEstimate: false,
        notes: "Qualified instructors in computer science and digital media"
      },
      {
        symbol: "studentLearners",
        name: "Enrolled Youth Learners",
        unit: "students",
        initialValue: 750,
        formula: "certifiedEducators * 25",
        costCategory: "direct_program",
        isEstimate: false,
        notes: "Active participants in after-school digital programs"
      },
      {
        symbol: "curriculumCompletionRate",
        name: "Course Completion Rate",
        unit: "%",
        initialValue: 80,
        formula: "80",
        costCategory: "direct_program",
        isEstimate: false,
        notes: "Percentage of students completing certification project"
      },
      {
        symbol: "graduatesEnteringWorkforce",
        name: "Graduates Entering Technical Roles",
        unit: "graduates/yr",
        initialValue: 240,
        formula: "studentLearners * (curriculumCompletionRate / 100) * 0.40",
        costCategory: "social_benefit",
        isEstimate: false,
        notes: "Youth securing employment or freelance technology roles"
      },
      {
        symbol: "communityIncomeMultiplier",
        name: "Annual Community Income Gains",
        unit: "USD/yr",
        initialValue: 1200000,
        formula: "graduatesEnteringWorkforce * 5000",
        costCategory: "social_benefit",
        isEstimate: false,
        notes: "Incremental wages injected into the local neighborhood economy"
      }
    ],
    sampleActions: [
      {
        title: "Train-the-Trainer Master Cohort",
        estSpending: 6000,
        estEffortHrs: 80,
        outstandingDirectCosts: 6000,
        impacts: [
          { symbol: "certifiedEducators", operation: "+", operand: 15, duration: "forever" }
        ],
        notes: "Creates a compounding multiplier by teaching teachers who mentor hundreds."
      },
      {
        title: "Interactive Apprenticeship Mentorship",
        estSpending: 4500,
        estEffortHrs: 60,
        outstandingDirectCosts: 4500,
        impacts: [
          { symbol: "curriculumCompletionRate", operation: "+", operand: 12, duration: "forever" }
        ],
        notes: "Pairs students with industry professionals to reduce course drop-out."
      }
    ]
  },
  {
    id: "philanthropic_donor_flywheel",
    title: "Donor Trust Flywheel & Philanthropic Capital",
    category: "Philanthropy",
    sector: "Philanthropy & Social Finance",
    summary: "Simulates the compounding virtuous loop between transparent impact reporting, community trust, recurring donor retention, and grant pool growth.",
    description: "Designed for foundation executives and NGO fundraisers. Demonstrates how radical decision transparency and verifiable leverage briefs accelerate donor retention and compound catalytic capital.",
    attribution: "Philanthropy Strategy Institute (CC BY-SA 4.0)",
    tags: ["Philanthropy", "Fundraising", "Governance", "Flywheel Effect"],
    nodes: [
      {
        symbol: "activeDonors",
        name: "Active Recurring Donors",
        unit: "supporters",
        initialValue: 800,
        formula: "delay(activeDonors, 1) + newDonorsAcquired - donorLapse",
        costCategory: "overhead",
        isEstimate: false,
        notes: "Committed supporters giving on a recurring monthly or annual basis"
      },
      {
        symbol: "donorTrustIndex",
        name: "Donor Trust & Transparency Index",
        unit: "pts",
        initialValue: 65,
        formula: "min(100, 50 + (verifiedImpactBriefs * 3))",
        costCategory: "overhead",
        isEstimate: false,
        notes: "Donor perception score boosted by verified decision briefs"
      },
      {
        symbol: "newDonorsAcquired",
        name: "New Donors Acquired",
        unit: "supporters/mo",
        initialValue: 40,
        formula: "donorTrustIndex * 0.7",
        costCategory: "overhead",
        isEstimate: true,
        notes: "Organic word of mouth and referral growth driven by high trust"
      },
      {
        symbol: "donorLapse",
        name: "Monthly Supporter Lapse",
        unit: "supporters/mo",
        initialValue: 20,
        formula: "activeDonors * (0.08 - (donorTrustIndex * 0.0005))",
        costCategory: "overhead",
        isEstimate: false,
        notes: "Churn decreases as transparency and trust increase"
      },
      {
        symbol: "philanthropicFundPool",
        name: "Annual Philanthropic Capital",
        unit: "USD/yr",
        initialValue: 480000,
        formula: "activeDonors * 600",
        costCategory: "direct_program",
        isEstimate: false,
        notes: "Available capital for direct societal mission delivery"
      },
      {
        symbol: "communityInitiativesFunded",
        name: "Community Programs Funded",
        unit: "programs/yr",
        initialValue: 16,
        formula: "philanthropicFundPool / 30000",
        costCategory: "social_benefit",
        isEstimate: false,
        notes: "Direct frontline projects launched and sustained"
      },
      {
        symbol: "verifiedImpactBriefs",
        name: "Published Decision & Audit Briefs",
        unit: "briefs/yr",
        initialValue: 8,
        formula: "communityInitiativesFunded * 0.8",
        costCategory: "social_benefit",
        isEstimate: false,
        notes: "Transparent simulation models published to donors"
      }
    ],
    sampleActions: [
      {
        title: "Open Decision Brief Transparency Portal",
        estSpending: 3000,
        estEffortHrs: 40,
        outstandingDirectCosts: 3000,
        impacts: [
          { symbol: "verifiedImpactBriefs", operation: "+", operand: 6, duration: "forever" }
        ],
        notes: "Publishes all strategic leverage briefs, powering the donor trust flywheel (R1)."
      },
      {
        title: "Mass Postal Direct Mail Campaign",
        estSpending: 9000,
        estEffortHrs: 60,
        outstandingDirectCosts: 9000,
        impacts: [
          { symbol: "newDonorsAcquired", operation: "+", operand: 25, duration: "forever" }
        ],
        notes: "Traditional one-off acquisition with higher unit cost and standard churn."
      }
    ]
  }
];

/**
 * Returns all public model templates.
 */
export function getPublicTemplates() {
  return PUBLIC_MODEL_TEMPLATES;
}

/**
 * Retrieves a specific template by ID.
 */
export function getTemplateById(templateId) {
  return PUBLIC_MODEL_TEMPLATES.find((t) => t.id === templateId) || null;
}

/**
 * Exports an organization's model as a portable, sanitized, open shareable template JSON.
 *
 * @param {Object} model - Model metadata
 * @param {Array} nodes - Model factors
 * @param {Array} actions - Model actions
 * @param {Object} metadata - Optional author & license metadata
 * @returns {Object} Canonical shareable template object
 */
export function exportModelAsShareableTemplate(model = {}, nodes = [], actions = [], metadata = {}) {
  const sanitizedNodes = (nodes || []).map((node) => ({
    symbol: node.symbol || "",
    name: node.name || node.symbol || "",
    unit: node.unit || "",
    initialValue: node.initialValue ?? node.latestValue ?? 0,
    formula: node.formula || "",
    costCategory: node.costCategory || "operational",
    isEstimate: Boolean(node.isEstimate),
    notes: node.notes || ""
  }));

  const sanitizedActions = (actions || []).map((action) => ({
    title: action.title || "",
    estSpending: action.estSpending ?? 0,
    estEffortHrs: action.estEffortHrs ?? 0,
    outstandingDirectCosts: action.outstandingDirectCosts ?? action.estSpending ?? 0,
    impacts: (action.impacts || []).map((imp) => ({
      symbol: imp.symbol || "",
      operation: imp.operation || "+",
      operand: imp.operand ?? imp.value ?? 0,
      duration: imp.duration || "forever"
    })),
    notes: action.notes || ""
  }));

  return {
    schemaVersion: "mipa.template.v1",
    exportedAt: new Date().toISOString(),
    id: `shared_${(model.name || "model").toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    title: model.name || "Community System Model",
    category: metadata.category || "Social Impact",
    sector: metadata.sector || "Civil Society",
    summary: metadata.summary || model.notes || "System dynamics leverage model created in Mipa.",
    description: metadata.description || model.notes || "Open access strategic coordination model.",
    attribution: metadata.attribution || metadata.author || "Community Contributor (CC BY-SA 4.0)",
    license: "CC BY-SA 4.0",
    tags: metadata.tags || ["Open Model", "Collective Impact"],
    nodes: sanitizedNodes,
    sampleActions: sanitizedActions
  };
}

/**
 * Validates and parses an imported shareable template JSON string or object.
 *
 * @param {string|Object} input - Raw JSON string or parsed object
 * @returns {Object} Validated template payload or throws Error
 */
export function validateAndParseTemplate(input) {
  let templateObj = input;
  if (typeof input === "string") {
    try {
      templateObj = JSON.parse(input);
    } catch {
      throw new Error("Invalid JSON format. Please provide a valid template file.");
    }
  }

  if (!templateObj || typeof templateObj !== "object") {
    throw new Error("Template payload must be a non-empty JSON object.");
  }

  if (!templateObj.title) {
    throw new Error("Template is missing required 'title' attribute.");
  }

  if (!Array.isArray(templateObj.nodes) || templateObj.nodes.length === 0) {
    throw new Error("Template must contain at least one factor node in 'nodes'.");
  }

  // Sanitize node symbols to avoid script injection
  const symbols = new Set();
  const cleanedNodes = templateObj.nodes.map((n, idx) => {
    const symbol = String(n.symbol || `factor_${idx + 1}`).trim().replace(/[^a-zA-Z0-9_]/g, "");
    if (!symbol) {
      throw new Error(`Invalid symbol at node index ${idx}.`);
    }
    symbols.add(symbol);
    return {
      symbol,
      name: String(n.name || symbol).trim(),
      unit: String(n.unit || "").trim(),
      initialValue: typeof n.initialValue === "number" ? n.initialValue : parseFloat(n.initialValue) || 0,
      formula: String(n.formula || "").trim(),
      costCategory: String(n.costCategory || "operational").trim(),
      isEstimate: Boolean(n.isEstimate),
      notes: String(n.notes || "").trim()
    };
  });

  return {
    ...templateObj,
    nodes: cleanedNodes,
    sampleActions: Array.isArray(templateObj.sampleActions) ? templateObj.sampleActions : []
  };
}

/**
 * 4-Step Self-Guided Onboarding Tour Definitions.
 */
export const ONBOARDING_TOUR_STEPS = [
  {
    step: 1,
    key: "system_map",
    icon: "account_tree",
    titleKey: "tourStep1Title",
    descKey: "tourStep1Desc",
    badge: "1. System Mapping"
  },
  {
    step: 2,
    key: "actions_interventions",
    icon: "bolt",
    titleKey: "tourStep2Title",
    descKey: "tourStep2Desc",
    badge: "2. Strategic Actions"
  },
  {
    step: 3,
    key: "simulation_leverage",
    icon: "insights",
    titleKey: "tourStep3Title",
    descKey: "tourStep3Desc",
    badge: "3. Leverage Ranking"
  },
  {
    step: 4,
    key: "decision_brief",
    icon: "description",
    titleKey: "tourStep4Title",
    descKey: "tourStep4Desc",
    badge: "4. Executive Brief"
  }
];

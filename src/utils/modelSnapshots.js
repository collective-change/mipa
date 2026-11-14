/**
 * Model Governance Snapshots & Decision Provenance Audit Trail
 *
 * Implements immutable model versioning, cryptographic content hashing (SHA-256),
 * decision provenance tracking, and deep factor/formula difference analysis.
 */

// Pure JavaScript synchronous SHA-256 implementation
export function sha256(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let lengthProperty = "length";
  let i, j;
  let result = "";

  const words = [];
  const asciiBitLength = ascii[lengthProperty] * 8;

  let hash = [];
  const k = [];
  let primeCounter = 0;

  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += "\x80";
  while ((ascii[lengthProperty] % 64) - 56) ascii += "\x00";
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return "";
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;

  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15],
        w2 = w[i - 2];

      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      w[i] =
        i < 16
          ? w[i]
          : (w[i - 16] + s0 + w[i - 7] + s1) | 0;

      const s0Hash = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const t2 = (s0Hash + maj) | 0;

      const s1Hash = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const t1 = (hash[7] + s1Hash + ch + k[i] + w[i]) | 0;

      hash = [(t1 + t2) | 0].concat(hash);
      hash[4] = (hash[4] + t1) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }
  return result;
}

/**
 * Normalizes model nodes and settings into a canonical deterministic structure.
 */
export function canonicalizeModelData(model = {}, nodes = []) {
  const cleanSettings = {
    modelId: model.modelId || model.id || "",
    modelName: model.modelName || model.name || "",
    discountRate: Number(model.discountRate) || 0,
    timeHorizonYears: Number(model.timeHorizonYears || model.timeHorizon) || 0,
    currency: model.currency || ""
  };

  const cleanNodes = (Array.isArray(nodes) ? nodes : [])
    .map((n) => ({
      id: String(n.id || n.symbol || ""),
      symbol: String(n.symbol || ""),
      name: String(n.name || ""),
      formula: String(n.formula || "").trim(),
      initialValue: n.initialValue !== undefined && n.initialValue !== null ? Number(n.initialValue) : null,
      unit: String(n.unit || "").trim(),
      isEstimate: Boolean(n.isEstimate),
      notes: String(n.notes || "").trim(),
      group: String(n.group || "").trim()
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    settings: cleanSettings,
    nodes: cleanNodes
  };
}

/**
 * Creates an immutable snapshot of a model and its factors.
 *
 * @param {Object} model - Model object
 * @param {Array} nodes - Factor node list
 * @param {Object} options - Snapshot metadata
 * @returns {Object} Immutable snapshot object with SHA-256 hash
 */
export function createModelSnapshot(model = {}, nodes = [], options = {}) {
  const canonical = canonicalizeModelData(model, nodes);
  const canonicalJson = JSON.stringify(canonical);
  const contentHash = sha256(canonicalJson);

  const timestamp = options.timestamp || new Date().toISOString();
  const id = options.id || `snap_${Date.now()}_${contentHash.slice(0, 8)}`;

  const author = {
    uid: options.author?.uid || "anonymous",
    displayName: options.author?.displayName || options.author?.email || "Decision Staff",
    email: options.author?.email || ""
  };

  return {
    id,
    modelId: model.id || "",
    modelName: model.name || "Untitled Model",
    createdAt: timestamp,
    author,
    note: options.note || "Strategic decision baseline snapshot",
    tags: Array.isArray(options.tags) ? options.tags : ["governance"],
    decisionBriefId: options.decisionBriefId || null,
    nodeCount: canonical.nodes.length,
    modelSettings: canonical.settings,
    nodes: canonical.nodes,
    contentHash
  };
}

/**
 * Verifies whether a snapshot's content matches its cryptographic SHA-256 hash.
 *
 * @param {Object} snapshot - Snapshot object
 * @returns {Object} Verification outcome
 */
export function verifySnapshotIntegrity(snapshot) {
  if (!snapshot || !snapshot.contentHash) {
    return { valid: false, reason: "Missing snapshot or content hash" };
  }

  const canonical = canonicalizeModelData(snapshot.modelSettings || {}, snapshot.nodes || []);
  const calculatedHash = sha256(JSON.stringify(canonical));

  const valid = calculatedHash === snapshot.contentHash;
  return {
    valid,
    storedHash: snapshot.contentHash,
    calculatedHash,
    reason: valid ? "Snapshot is cryptographically verified and untampered" : "Content hash mismatch; snapshot was modified"
  };
}

/**
 * Compares two model states (Snapshot A vs Snapshot B or Live Model) to extract factor-level diffs.
 *
 * @param {Object|Array} baseline - Baseline snapshot or node array
 * @param {Object|Array} current - Comparison snapshot or node array
 * @param {Object} [options] - Options (locale, etc.)
 * @returns {Object} Structured differences
 */
export function diffModelSnapshots(baseline, current, options = {}) {
  const isZh = (options.locale || "").toLowerCase().startsWith("zh");

  const nodesA = Array.isArray(baseline) ? baseline : baseline?.nodes || [];
  const nodesB = Array.isArray(current) ? current : current?.nodes || [];

  const mapA = new Map(nodesA.map((n) => [n.id || n.symbol, n]));
  const mapB = new Map(nodesB.map((n) => [n.id || n.symbol, n]));

  const added = [];
  const removed = [];
  const modified = [];
  let unchangedCount = 0;

  // Detect removed & modified
  for (const [id, nodeA] of mapA.entries()) {
    const nodeB = mapB.get(id);
    if (!nodeB) {
      removed.push({
        id,
        symbol: nodeA.symbol,
        name: nodeA.name || nodeA.symbol,
        formula: nodeA.formula,
        initialValue: nodeA.initialValue,
        unit: nodeA.unit
      });
      continue;
    }

    const fieldChanges = [];

    // Compare formulas
    const formulaA = (nodeA.formula || "").trim();
    const formulaB = (nodeB.formula || "").trim();
    if (formulaA !== formulaB) {
      fieldChanges.push({
        field: "formula",
        label: isZh ? "計算公式" : "Formula",
        oldValue: formulaA || (isZh ? "（無公式）" : "(None)"),
        newValue: formulaB || (isZh ? "（無公式）" : "(None)")
      });
    }

    // Compare initial/baseline values
    const valA = Number(nodeA.initialValue);
    const valB = Number(nodeB.initialValue);
    if (nodeA.initialValue !== nodeB.initialValue && (!isNaN(valA) || !isNaN(valB))) {
      const shiftPercent = !isNaN(valA) && valA !== 0 && !isNaN(valB) ? Math.round(((valB - valA) / Math.abs(valA)) * 100) : null;
      fieldChanges.push({
        field: "initialValue",
        label: isZh ? "基準數值" : "Baseline Value",
        oldValue: nodeA.initialValue,
        newValue: nodeB.initialValue,
        shiftPercent
      });
    }

    // Compare units
    if ((nodeA.unit || "").trim() !== (nodeB.unit || "").trim()) {
      fieldChanges.push({
        field: "unit",
        label: isZh ? "單位" : "Unit",
        oldValue: nodeA.unit || "-",
        newValue: nodeB.unit || "-"
      });
    }

    // Compare estimate flag
    if (Boolean(nodeA.isEstimate) !== Boolean(nodeB.isEstimate)) {
      fieldChanges.push({
        field: "isEstimate",
        label: isZh ? "估算標記" : "Estimate Flag",
        oldValue: Boolean(nodeA.isEstimate),
        newValue: Boolean(nodeB.isEstimate)
      });
    }

    if (fieldChanges.length > 0) {
      modified.push({
        id,
        symbol: nodeB.symbol || nodeA.symbol,
        name: nodeB.name || nodeA.name || id,
        changes: fieldChanges
      });
    } else {
      unchangedCount++;
    }
  }

  // Detect added
  for (const [id, nodeB] of mapB.entries()) {
    if (!mapA.has(id)) {
      added.push({
        id,
        symbol: nodeB.symbol,
        name: nodeB.name || nodeB.symbol,
        formula: nodeB.formula,
        initialValue: nodeB.initialValue,
        unit: nodeB.unit
      });
    }
  }

  // Build summary narrative
  let summaryNarrative;
  const totalDifferences = added.length + removed.length + modified.length;

  if (totalDifferences === 0) {
    summaryNarrative = isZh
      ? "當前模型要素與歷史基準完全一致，未發現任何公式或數值變動。"
      : "The current model factors are completely identical to the historical baseline; no formula or value shifts detected.";
  } else if (isZh) {
    summaryNarrative = `與歷史基準相比，共檢測到 ${totalDifferences} 處要素差異：\n` +
      (modified.length ? `• 修改要素（${modified.length} 個）：${modified.map((m) => `「${m.name}」`).join("、")}\n` : "") +
      (added.length ? `• 新增要素（${added.length} 個）：${added.map((a) => `「${a.name}」`).join("、")}\n` : "") +
      (removed.length ? `• 移除要素（${removed.length} 個）：${removed.map((r) => `「${r.name}」`).join("、")}\n` : "");
  } else {
    summaryNarrative = `Compared to the historical baseline, detected ${totalDifferences} factor change(s):\n` +
      (modified.length ? `- Modified factor(s) (${modified.length}): ${modified.map((m) => `"${m.name}"`).join(", ")}\n` : "") +
      (added.length ? `- Added factor(s) (${added.length}): ${added.map((a) => `"${a.name}"`).join(", ")}\n` : "") +
      (removed.length ? `- Removed factor(s) (${removed.length}): ${removed.map((r) => `"${r.name}"`).join(", ")}\n` : "");
  }

  return {
    totalDifferences,
    added,
    removed,
    modified,
    unchangedCount,
    summaryNarrative
  };
}

// In-memory fallback for test and non-browser environments
const inMemorySnapshotStore = new Map();

/**
 * Saves a snapshot to local persistence.
 */
export function saveSnapshotToStorage(modelId, snapshot) {
  if (!modelId || !snapshot) return false;
  try {
    const key = `mipa_model_snapshots_${modelId}`;
    let list = loadSnapshotsFromStorage(modelId);
    list = [snapshot, ...list.filter((s) => s.id !== snapshot.id)];

    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(list));
    } else {
      inMemorySnapshotStore.set(key, list);
    }
    return true;
  } catch (err) {
    console.error("Failed to save model snapshot to storage", err);
    return false;
  }
}

/**
 * Loads snapshots for a model from storage.
 */
export function loadSnapshotsFromStorage(modelId) {
  if (!modelId) return [];
  try {
    const key = `mipa_model_snapshots_${modelId}`;
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } else if (inMemorySnapshotStore.has(key)) {
      return inMemorySnapshotStore.get(key);
    }
    return [];
  } catch (err) {
    console.error("Failed to load model snapshots from storage", err);
    return [];
  }
}

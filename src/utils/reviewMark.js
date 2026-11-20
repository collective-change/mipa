// The wording of an automated review's mark (MIPA-43, decision M-3).
//
// M-3 makes the claim mechanical: "checked against mipa methodology vX by
// model Y on date Z" - never "reviewed". The sentence is GENERATED here from
// the provenance block the review stored (functions/src/review/provenance.ts);
// there is no parameter through which it can be typed. A record missing any
// field gets no mark at all rather than a partial one.

const REQUIRED = ["provider", "model", "methodologyVersion", "reviewedAt", "pinStatus"];
const DRIFT_FIELDS = ["provider", "model", "methodologyVersion"];

export class ReviewMarkError extends Error {}

function assertProvenance(p) {
  if (!p || typeof p !== "object") throw new ReviewMarkError("No provenance stored on this review.");
  for (const field of REQUIRED) {
    if (typeof p[field] !== "string" || !p[field].trim()) {
      throw new ReviewMarkError(`The review's stored provenance has no ${field}.`);
    }
  }
  if (Number.isNaN(new Date(p.reviewedAt).getTime())) {
    throw new ReviewMarkError("The review's stored timestamp is not a date.");
  }
}

// Fields whose current value differs from the one the review stored. The
// stored record is the truth about the past; drift is reported beside it.
export function reviewVersionDrift(provenance, current) {
  if (!current) return [];
  return DRIFT_FIELDS.filter((f) => current[f] && current[f] !== provenance[f]);
}

// Message keys and parameters, so a caller with any i18n can render them.
export function reviewMarkParts(provenance, current = null) {
  assertProvenance(provenance);
  const parts = [
    {
      key: "reviewMarkText",
      params: {
        methodology: provenance.methodologyVersion,
        model: provenance.model,
        provider: provenance.provider,
        // The date in UTC, as stored, so the mark reads the same everywhere.
        date: new Date(provenance.reviewedAt).toISOString().slice(0, 10)
      }
    }
  ];
  if (provenance.pinStatus !== "pinned") {
    parts.push({ key: "reviewMarkUnpinned", params: {} });
  }
  const drift = reviewVersionDrift(provenance, current);
  if (drift.length) {
    parts.push({ key: "reviewMarkDrift", params: {}, fields: drift.map((f) => `reviewMarkField_${f}`) });
  }
  return parts;
}

// The rendered mark. `t` is vue-i18n's translate function (or any (key,
// params) => string).
export function reviewMarkText(provenance, t, current = null) {
  return reviewMarkParts(provenance, current)
    .map((part) => {
      const params = part.fields
        ? { fields: part.fields.map((k) => t(k)).join(t("reviewMarkFieldSeparator")) }
        : part.params;
      return t(part.key, params);
    })
    .join(" ");
}

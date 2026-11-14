// Mock OpenAI-compatible provider for end-to-end tests of Draft my model.
require("fs").mkdirSync(require("path").join(__dirname, "shots"), { recursive: true });
const http = require("http");
const log = [];
const factor = (symbol, name, formula, unit, group, extra = {}) => ({
  name, symbol, formula, unit, group,
  explanation: `${name} explained.`, isEstimate: true, estimateReasoning: "a rough guess", isHourlyCost: false, ...extra
});
const draft = (fixed, solar) => ({
  kind: "draft",
  message: "Here is a first draft.",
  questions: [],
  summary: "A small bakery: bread sales, flour and wages." + (solar ? " With solar panels." : ""),
  groups: ["Sales", "Costs"],
  factors: [
    factor("loavesSold", "loaves sold per month", "3000", "", "Sales"),
    // first draft: price has no unit, so sales income is a plain number - a unit error
    factor("pricePerLoaf", "price per loaf", "4", fixed ? "USD" : "", "Sales"),
    factor("salesIncome", "sales income", "loavesSold * pricePerLoaf", "USD", "Sales", { isEstimate: false, estimateReasoning: "" }),
    factor("wages", "wages per month", "11200", "USD", "Costs"),
    factor("bakerPerHour", "baker's hourly cost", "25", "USD", "Costs", { isHourlyCost: true }),
    ...(solar ? [factor("solarSavings", "energy saved by solar panels", "300", "USD", "Costs")] : [])
  ],
  changesToExisting: [
    { symbol: "benefitToOrganizationDuringInterval", newFormula: "salesIncome", explanation: "The bakery's benefit is its sales income." },
    { symbol: "costToOrganizationDuringInterval", newFormula: "wages" + (solar ? " - solarSavings" : "") + " + oneTimeSpending + oneTimeEffort / (1 workhour) * averageEffortCostPerHour", explanation: "Wages plus what actions need." }
  ]
});
http.createServer((req, res) => {
  let body = "";
  req.on("data", c => (body += c));
  req.on("end", () => {
    const json = JSON.parse(body || "{}");
    const users = (json.messages || []).filter(m => m.role == "user");
    const last = users.length ? users[users.length - 1].content : "";
    log.push({ path: req.url, auth: req.headers.authorization, users: users.length, last: last.slice(0, 200), hasSchema: !!json.response_format });
    let reply;
    if (json.max_tokens == 5) reply = "OK";
    else if (/# What the user wrote/.test(last))
      reply = { kind: "questions", message: "Two quick questions.", questions: [
        { question: "Do you also sell to cafés?", why: "Wholesale changes the sales part." },
        { question: "Do you rent the shop?", why: "Rent is a large fixed cost." }], summary: "", groups: [], factors: [], changesToExisting: [] };
    else if (/could not be calculated/.test(last)) reply = draft(true, false);
    else if (/solar/i.test(last)) reply = draft(true, true);
    else reply = draft(false, false);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      choices: [{ message: { content: typeof reply == "string" ? reply : JSON.stringify(reply) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 800 } }
    }));
  });
}).listen(8787, "127.0.0.1", () => console.log("mock ai on 8787"));
process.on("SIGTERM", () => { require("fs").writeFileSync(require("path").join(__dirname, "shots", "fake-ai-log.json"), JSON.stringify(log, null, 1)); process.exit(0); });
setInterval(() => require("fs").writeFileSync(require("path").join(__dirname, "shots", "fake-ai-log.json"), JSON.stringify(log, null, 1)), 1000);

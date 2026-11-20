import assert from "node:assert/strict";
import { once } from "node:events";
import { after, test } from "node:test";

process.env.PORT = "0";
const { server } = await import("./server.mjs");
if (!server.listening) await once(server, "listening");
after(async () => {
  server.close();
  await once(server, "close");
});

async function post(body) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/triage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return { status: response.status, data: await response.json() };
}

test("returns the topic and draft for valid requests", async () => {
  for (const [text, topic] of [
    ["Когда будет доставка?", "delivery"],
    ["Какова стоимость заказа?", "pricing"],
    ["Как с вами связаться?", "other"],
  ]) {
    const result = await post(JSON.stringify({ text }));
    assert.deepEqual(result, {
      status: 200,
      data: { status: "ready", topic, draft: "Спасибо за обращение. Уточним детали заявки." },
    });
  }
});

test("rejects empty, missing, non-string and malformed input", async () => {
  for (const body of ['{"text":""}', '{"text":"   "}', "{}", "null", '{"text":42}', "{", ""]) {
    const result = await post(body);
    assert.deepEqual(result, { status: 400, data: { status: "invalid_input" } }, body);
  }
});

const manualReview = { status: 200, data: { status: "manual_review", topic: null, draft: null } };

test("routes provider errors and invalid output to manual review", async () => {
  for (const text of ["[error]", "[bad-json]", "[bad-topic]", "[empty-draft]"]) {
    assert.deepEqual(await post(JSON.stringify({ text })), manualReview, text);
  }
});

test("routes a timeout to manual review before the mock's 1200 ms delay", async () => {
  const start = performance.now();
  assert.deepEqual(await post('{"text":"[timeout]"}'), manualReview);
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 1100, `Expected the model wait to be cut short, took ${elapsed.toFixed(0)} ms`);
});

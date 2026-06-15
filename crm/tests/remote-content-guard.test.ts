import assert from "node:assert/strict";
import test from "node:test";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../apps/api/src/security/remote-content.js";

const blockedVectors = [
  '<img src="https://tracker.example/pixel.png">',
  '<iframe src="//tracker.example/frame"></iframe>',
  '<script src="http://tracker.example/script.js"></script>',
  '<source srcset="https://tracker.example/a.png 1x, https://tracker.example/b.png 2x">',
  "background-image: url(https://tracker.example/bg.png)",
  "color: red; content: url(//tracker.example/pixel.svg)",
  "![pixel](https://tracker.example/pixel.png)",
];

const safeValues = [
  "Cliente pediu retorno por WhatsApp as 15h.",
  "Link textual sem embed: https://example.com/proposta",
  "<strong>Texto em destaque</strong>",
  "url(/assets/local.png)",
  "![anexo local](/uploads/documento.png)",
];

test("remote content guard detects loadable remote tracker vectors", () => {
  for (const value of blockedVectors) {
    assert.equal(containsRemoteLoadVector(value), true, value);
  }
});

test("remote content guard allows non-loadable text and local references", () => {
  for (const value of safeValues) {
    assert.equal(containsRemoteLoadVector(value), false, value);
  }
});

test("remote content guard message names blocked resource classes", () => {
  const message = rejectRemoteLoadVectorsMessage("Campo");

  assert.match(message, /imagens/);
  assert.match(message, /iframes/);
  assert.match(message, /scripts/);
  assert.match(message, /CSS url\(\)/);
  assert.match(message, /markdown image/);
});

// Self-test of the CBC protocol parser against the DT435 §3.1.1 worked example.
const assert = require('assert');
const p = require('../src/protocol');

let pass = 0;
const eq = (a, b, msg) => { assert.strictEqual(a, b, `${msg}: got ${a}, expected ${b}`); pass++; };

// Checksums (DT435 §2): sum of ASCII of header+params, low byte, hex
eq(p.checksum('&A'), '67', 'checksum &A');
eq(p.checksum('&I'), '6F', 'checksum &I');
eq(p.checksum('&S'), '79', 'checksum &S');
eq(p.buildCommand('&A'), '(&A)', 'build &A no checksum');
eq(p.buildCommand('&A', true), '(&A67)', 'build &A with checksum');

// §3.7 comma table
const d3e = p.decimalsFromComma('3E');
eq(`${d3e.total}${d3e.volume}${d3e.price}`, '233', '3E -> total2 vol3 price3');
const d3a = p.decimalsFromComma('3A');
eq(`${d3a.total}${d3a.volume}${d3a.price}`, '223', '3A -> total2 vol2 price3');

// §3.1.1 worked example: RX (00038600386010003E001C0812164002068300000807890098)
const f = p.parseFueling('00038600386010003E001C0812164002068300000807890098');
eq(f.totalValue,   3.86,  'total value');
eq(f.volumeLiters, 3.86,  'volume liters');       // 003860 with 3 decimals = 3.860
eq(f.unitPrice,    1,     'unit price');          // 1000 with 3 decimals = 1.000
eq(Math.round(f.volumeLiters * f.unitPrice * 100) / 100, 3.86, 'vol*price == total');
eq(f.nozzleCode,   8,     'nozzle code (08 hex)');
eq(f.registro,     683,   'registro (0683 dec)');
eq(f.month,        2,     'month');
eq(f.day,          12,    'day');
eq(f.hour,         16,    'hour');
eq(f.minute,       40,    'minute');
eq(f.encerranteFinal, 807.89, 'encerrante final (2 decimais)');
eq(f.memStatus,    '00',  'mem status ok');

// "(0)" -> no fueling
eq(p.parseFueling('0'), null, 'no fueling -> null');
eq(p.parseFueling(''),  null, 'empty -> null');

// extractFrame
const ef = p.extractFrame('garbage(&A67)tail');
eq(ef.content, '&A67', 'extractFrame content');
eq(ef.rest,    'tail', 'extractFrame rest');

// ── §3.1.3 IDENTIFIED read (73 chars): A[1] + core[48] + I[16] + M[4] + P[2] + K[2]
// Built from the §3.1.1 core + the identifier seen in the PDF's identified RX example.
const PLAIN = '00038600386010003E001C0812164002068300000807890098';
const CORE48 = PLAIN.slice(0, 48);
const ID = 'B3CF6CCFFF1FD792';
const IDENT = 'A' + CORE48 + ID + '0001' + '00' + 'AB';   // 1+48+16+4+2+2 = 73
eq(IDENT.length, 73, 'identified content length');
eq(IDENT.slice(49, 65), ID, 'identifier sits at offset 49..65');

const idf = p.parseIdentifiedFueling(IDENT);
eq(idf.mode,          'identified', 'mode identified');
eq(idf.identfidCode,  ID,           'identfidCode captured');
eq(idf.attendantTag,  ID,           'attendantTag from identifier');
eq(idf.identifierRaw, ID,           'raw identifier');
eq(idf.registro,      683,          'identified: registro');
eq(idf.nozzleCode,    8,            'identified: nozzle');
eq(idf.totalValue,    3.86,         'identified: total');
eq(idf.volumeLiters,  3.86,         'identified: volume');
eq(idf.prefix,        'A',          'identified: A[1] prefix');

// auto-detect dispatcher
eq(p.parseFuelingResponse(IDENT).mode, 'identified', 'dispatch -> identified (73)');
eq(p.parseFuelingResponse(PLAIN).mode, 'plain',      'dispatch -> plain (50)');
eq(p.parseFuelingResponse('0'),        null,         'dispatch -> null on (0)');

// blank identifiers -> null (no card)
eq(p.parseIdentifiedFueling('A' + CORE48 + '0000000000000000' + '00000000').identfidCode, null, 'all-zeros id -> null');
eq(p.parseIdentifiedFueling('A' + CORE48 + 'FFFFFFFFFFFFFFFF' + '00000000').identfidCode, null, 'all-F id -> null');

console.log(`\n✅ protocol self-test passed (${pass} assertions)`);

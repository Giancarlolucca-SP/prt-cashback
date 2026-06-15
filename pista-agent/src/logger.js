function line(level, args) {
  const ts = new Date().toISOString();
  const rest = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ');
  console.log(`[${ts}] [${level}] ${rest}`);
}
module.exports = {
  info:  (...a) => line('INFO', a),
  warn:  (...a) => line('WARN', a),
  error: (...a) => line('ERRO', a),
  step:  (...a) => line('PASSO', a),
};

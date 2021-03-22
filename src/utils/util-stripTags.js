function stripTags(originalString) {
  return originalString.replace(/(<([^>]+)>)/gi, "");
}

function stripScriptTags(originalString) {
  var SCRIPT_REGEX = /<script(?:(?!\/\/)(?!\/\*)[^'"]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*(?:\n)|\/\*(?:(?:.|\s))*?\*\/)*?<\/script>/gi;
  let text = originalString;
  while (SCRIPT_REGEX.test(text)) {
    text = text.replace(SCRIPT_REGEX, "");
  }
  if (originalString != text) console.log(`${originalString} -> ${text}`);
  return text;
}

export { stripTags, stripScriptTags };

function stripTags(originalString) {
  return originalString.replace(/(<([^>]+)>)/gi, "");
}

function stripScriptTags(originalString) {
  return originalString.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    ""
  );
}

export { stripTags, stripScriptTags };

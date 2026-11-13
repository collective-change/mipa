<template>
  <span class="latex-formula" v-html="html"></span>
</template>

<script>
import katex from "katex";
import "katex/dist/katex.min.css";

// Renders a LaTeX string with KaTeX (replaces vue-mathjax + MathJax CDN).
export default {
  props: {
    formula: { type: String, default: "" }
  },
  computed: {
    html() {
      return katex.renderToString(this.formula, {
        throwOnError: false,
        displayMode: false
      });
    }
  }
};
</script>

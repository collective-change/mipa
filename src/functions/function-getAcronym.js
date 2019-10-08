export function getAcronym(term) {
  var words, acronym, nextWord;

  words = term.split(" ");
  acronym = "";
  index = 0;
  while (index < words.length) {
    nextWord = words[index];
    acronym = acronym + nextWord.charAt(0);
    index = index + 1;
  }
  return acronym;
}

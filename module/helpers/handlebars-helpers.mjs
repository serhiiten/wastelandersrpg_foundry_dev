export const registerHandlebarsHelpers = function () {
  Handlebars.registerHelper("numLoop", function (num, options) {
    let result = "";
    for (let i = 0, j = num; i < j; i++) {
      result = result + options.fn(i);
    }

    return result;
  });

  Handlebars.registerHelper("getLocalize", function (path, key) {
    const name = path + key.charAt(0).toUpperCase() + key.slice(1);
    const localizeName = game.i18n.localize(name);

    return localizeName;
  });

  Handlebars.registerHelper("add", function (a, b) {
    return a + b;
  });
};

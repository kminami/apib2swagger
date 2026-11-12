# Search [/api/iconsets]

## By Keyword [GET /api/iconsets/v3/search?term={term}&amount={amount}&offset={offset}&platform={platform}&language={language}]

+ Parameters
    + term: `home` (string, required) - the name or tag of the icon or any other phrase.
    + amount (number, optional) - the maximum number of icons which you'd like to receive
        + Default: 25
    + offset (number, optional) - the offset from the first received result
        + Default: 0
    + platform (enum[string], optional) - the style of the icons
        + Default: `all`
        + Members
            + `all`
            + `ios7`
            + `win10`
    + language: `en-US` (enum[string], required) - the language code to get localized result
        + Members
            + `en-US`
            + `fr-FR`
            + `ja-JP`

+ Response 200 (application/json)

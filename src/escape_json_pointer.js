// RFC 6901
function escapeJSONPointer(input) {
    s = input.replace(/~/g, '~0')
    return s.replace(/\//g, '~1')
}

module.exports = escapeJSONPointer;

const { hasFileRef, normalizeIncludes, getRefFromInclude } = require('../src/util')
const assert = require('assert')

describe('util', () => {
    describe('hasFileRef', () => {
        it('should return true when include is present - has spaces', () => {
            const result = hasFileRef('<!-- include(test.json) -->')
            assert.equal(result, true)
        })

        it('should return true when include is present - lack of spaces', () => {
            const result = hasFileRef('<!--include(test.json)-->')
            assert.equal(result, true)
        })

        it('should return false when include is not present', () => {
            const result = hasFileRef('test.json')
            assert.equal(result, false)
        })
    });

    describe('normalizeIncludes', () => {
        it('should not affect contents before or after the include', () => {
            const result = normalizeIncludes('12345<!-- include: path/to/file.json -->6789')
            assert.equal(result, '12345<!-- include(path/to/file.json) -->6789')
        })
        
        it('should work with different input syntaxes', () => {
            const inputSyntaxes = [
                '<!-- include: path/to/file.json -->',
                '<!-- include:path/to/file.json-->',
                '<!-- include(path/to/file.json)-->',
                '<!-- include (path/to/file.json) -->',
                '<!-- include ( path/to/file.json ) -->',
                '<!-- include  (  path/to/file.json  )  -->',
                '<!-- include (path/to/file.json -->',
            ]
            inputSyntaxes.forEach(str => {
                const result = normalizeIncludes(str)
                assert.equal(result, '<!-- include(path/to/file.json) -->')
            })
        })

        it('should work with multiple includes', () => {
            const result = normalizeIncludes(`
                1234<!-- include: path/to/file.json -->5678
                1111<!-- include(path/to/file.json)-->2222
            `)
            assert.equal(result, `
                1234<!-- include(path/to/file.json) -->5678
                1111<!-- include(path/to/file.json) -->2222
            `)
        })

        it('should allow parens in file name', () => {
            const result = normalizeIncludes('<!-- include: path/to/file(test).json -->')
            assert.equal(result, '<!-- include(path/to/file(test).json) -->')
        })
    });

    describe('getRefFromInclude', () => {
        it('should work with different input stynaxes', () => {
            const inputSyntaxes = [
                '<!-- include: path/to/file.json -->',
                '<!-- include:path/to/file.json-->',
                '<!-- include(path/to/file.json)-->',
                '<!-- include (path/to/file.json) -->',
                '<!-- include ( path/to/file.json ) -->',
                '<!-- include (path/to/file.json -->',
            ]
            inputSyntaxes.forEach(str => {
                const result = getRefFromInclude(str)
                assert.deepEqual(result, { $ref: 'path/to/file.json' })
            })
        }) 

        it('should allow parens in file name', () => {
            const result = getRefFromInclude('<!-- include: path/to/file(test).json -->')
            assert.deepEqual(result, { $ref: 'path/to/file(test).json' })
        })

        it('should throw an error if the syntax does not match a supported syntax', () => {
            assert.throws(() => {
                getRefFromInclude('<!-- include[path/to/file(test).json] -->')
            })
        })
    });
})
const { hasFileRef, normalizeIncludes, getRefFromInclude, getAbsolutePath } = require('../src/util')
const assert = require('assert')
const sinon = require('sinon')
const fs = require('fs')

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

    describe('getAbsolutePath', () => {
        const existsSync = sinon.stub(fs, 'existsSync')
        const cwdStub = sinon.stub(process, 'cwd')
        afterEach(() => {
            existsSync.reset()
            cwdStub.reset()
        })

        it('should return the path to the give source directory if the file exists', () => {
            existsSync.returns(true)
            const result = getAbsolutePath({ ['source-dir']: '~/source/dir/' }, '/file.json')
            assert.equal(result, '~/source/dir/file.json')
        })

        it('should return the correct path when source is not given and execution path file exists', () => {
            cwdStub.returns('~/cwd/dir/')
            existsSync.returns(true)

            const result = getAbsolutePath({}, '/file.json')
            assert.equal(result, '~/cwd/dir/file.json')
        })

        it('should return the correct path when source path does not exist and execution path file exists', () => {
            cwdStub.returns('~/cwd/dir/2/')
            existsSync.onCall(0).returns(false)
            existsSync.onCall(1).returns(true)

            const result = getAbsolutePath({ ['source-dir']: '~/source/dir/' }, '/file.json')
            assert.equal(result, '~/cwd/dir/2/file.json')
        }) 

        it('should return input path when other options do not exist and input path file exists', () => {
            cwdStub.returns('~/cwd/dir/')
            existsSync.onCall(0).returns(false)
            existsSync.onCall(1).returns(false)
            existsSync.onCall(2).returns(true)

            const options = {
                ['source-dir']: '~/source/dir/',
                input: '~/input/api.md'
            }
            const result = getAbsolutePath(options, '/file.json')
            assert.equal(result, '~/input/file.json')
        })

        it('should return null if the file does not exist at any of the paths', () => {
            cwdStub.returns('~/cwd/dir/')
            existsSync.onCall(0).returns(false)
            existsSync.onCall(1).returns(false)
            existsSync.onCall(2).returns(false)
            existsSync.onCall(3).returns(true)

            const options = {
                ['source-dir']: '~/source/dir/',
                input: '~/input/api.md'
            }
            const result = getAbsolutePath(options, '/file.json')
            assert.equal(result, null)
        })
    })
})
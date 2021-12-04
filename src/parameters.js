
const getParamType = (name, uriTemplate, options) => {
    const defaultType = options.openApi3 ? 'query' : 'body'
    if (!uriTemplate) return defaultType;
    for (var i = 0; i < uriTemplate.expressions.length; i++) {
        var exp = uriTemplate.expressions[i];
        if (!exp.varspecs) continue;
        for (var j = 0; j < exp.varspecs.length; j++) {
            var spec = exp.varspecs[j];
            if (spec.varname === name) {
                return exp.operator.symbol === '?' ? 'query' : 'path';
            }
        }
    }
    return defaultType;
}

module.exports.processParameters = (parameters, uriTemplate, options) => {
    const { openApi3 } = options
    var PARAM_TYPES = {
        'string': 'string',
        'number': 'number',
        'integer': 'integer',
        'boolean': 'boolean', 'bool': 'boolean',
        'array': 'array',
        'file': 'file'
    }
    var params = [];
    //console.log(parameters);
    for (var l = 0; l < parameters.length; l++) {
        var parameter = parameters[l];
        //console.log(parameter);
        // in = ["query", "header", "path", "formData", "body"]
        var param = {
            'name': parameter.name,
            'in': getParamType(parameter.name, uriTemplate, options),
            'description': parameter.description
        };
        if (openApi3) {
            if (parameter.required) {
                // Only add required if the value is true. False is not an accepted value.
                param.required = true
          
            }
        } else {
            param.required = parameter.required
        }
        if (parameter.example) {
            if (openApi3) {
                param.example = parameter.example
            } else {
                param['x-example'] = parameter.example
            }
        }

        var paramType = undefined;
        if (PARAM_TYPES.hasOwnProperty(parameter.type)) {
            paramType = PARAM_TYPES[parameter.type];
        } else {
            paramType = 'string';
        }

        var allowedValues = []
        for (var j = 0; j < parameter.values.length; j++) {
            allowedValues.push(parameter.values[j].value);
        }

        var parameterDefault = undefined;
        if (parameter.default) {
            if (paramType === 'number' || paramType === 'integer') {
                parameterDefault = Number(parameter.default);
            } else {
                parameterDefault = parameter.default;
            }
        }

        // Body parameters has all info in schema
        if (param.in === 'body') {
            param.schema = {
                'type': paramType
            }
            if (allowedValues.length > 0) {
                param.schema.enum = allowedValues;
            }
            if (parameterDefault) {
                param.schema.default = parameterDefault;
            }
        } else {
            if (openApi3) {
                param.schema = { type: paramType }
                if (parameterDefault) {
                    param.schema.default = parameterDefault;
                }
                if (allowedValues.length > 0) {
                    param.schema.enum = allowedValues;
                }
            } else {
                param.type = paramType;
                if (parameterDefault) {
                    param.default = parameterDefault;
                }
                if (allowedValues.length > 0) {
                    param.enum = allowedValues;
                }
            }
        }
        params.push(param);
    }
    return params;
}


let fs = require('fs')
let yaml = require('js-yaml');

/**
 * This module generates a valid OpenAPI (swagger 2.0) javascript object (YAML convertible) and put it in a file (API_definition.yml)
 * Usage:
 *      first call intializateAPIDefinition(options)
 *      then for each controller you have, call generateAPIDefinition(controller)
 */

//This represents the YAML structure for the Swagger editor
let openAPIdoc = {} 
let newTagName = ""

/**
 * Build recursively the "schema" section of the openAPIdoc YAML
 *
 * Input: webapiSchema -> a valid web-api schema for the endpoint
 * Input/Output: openAPISchema -> the partial open api schema
 */
function buildOpenAPISchema(openAPISchema, webapiSchema){
  
    openAPISchema['type'] = 'object'
    openAPISchema['required'] = []
    openAPISchema['properties'] = {}
 
    Object.keys(webapiSchema).forEach(schemaProperty => {
        if(!webapiSchema[schemaProperty].hasOwnProperty('optional')){
            openAPISchema['required'].push(schemaProperty)
        }
        if(webapiSchema[schemaProperty].hasOwnProperty('in')){
            //for OpenAPI, this is an enum
            openAPISchema['properties'][schemaProperty] = {type: 'string', enum: webapiSchema[schemaProperty]['in']}
        }else{
            if(!webapiSchema[schemaProperty].hasOwnProperty('type')){
                
                if(webapiSchema[schemaProperty].hasOwnProperty('schema')){
                    //it's another javascript object...
                    openAPISchema['properties'][schemaProperty] = {}
                    buildOpenAPISchema(openAPISchema['properties'][schemaProperty], webapiSchema[schemaProperty]['schema'])
                }else{
                    //it's a simple property with the "type" as the only information
                    openAPISchema['properties'][schemaProperty] = {type: webapiSchema[schemaProperty]}
                }
            }else{
                if(webapiSchema[schemaProperty]['type'] == 'array'){
                    arrayItemsSchema = {}
                    buildOpenAPISchema(arrayItemsSchema, webapiSchema[schemaProperty]['items']['schema'])
                    openAPISchema['properties'][schemaProperty] = {type: webapiSchema[schemaProperty]['type'], 
                                                                items: arrayItemsSchema
                                                                }
                }else{
                    //it's the last javascript object if type is not array
                    openAPISchema['properties'][schemaProperty] = {type: webapiSchema[schemaProperty]['type']}
                }
            }
        }
    })
}

/**
 * A tag is a name for grouping your endpoints. 
 * This logic to decide if the tag is new and valid (is not an uri parameter)
 */
function updateTags(endpointControllerObject){
    newTagName = ""
    if(endpointControllerObject.path.replace('/','').indexOf('/') != -1){
        //it's a large uri /{string}/{string}/...
        newTagName = endpointControllerObject.path.slice(1,endpointControllerObject.path.replace('/','').indexOf('/')+1)
    }else{
        if(endpointControllerObject.path.replace('/','').indexOf(':') == -1){
            //it's not an uri parameter
            newTagName = endpointControllerObject.path.replace('/','')
        }
    }
    //if it's a new tag
    if((newTagName !== "") && (openAPIdoc.tags.indexOf(newTagName) == -1)){
        openAPIdoc.tags.push({name: newTagName, description: tagDescription})
    }
}

function translatePathIntoOpenAPISyntax(endpointControllerObject){

    endpointControllerObject.path = endpointControllerObject.path.replace(":","{")

    parameterBeginIndex = endpointControllerObject.path.indexOf("{")
    endOfParameter = 0
    for(var i = parameterBeginIndex; i < endpointControllerObject.path.length; i++) {
        if(endpointControllerObject.path.charAt(i) == '/'){
            endOfParameter = i
            break
        }
    }
    if(endOfParameter == 0){
        endOfParameter = endpointControllerObject.path.length
    }
    URIparameterName = endpointControllerObject.path.slice(parameterBeginIndex+1,endOfParameter)
    endpointControllerObject.path = endpointControllerObject.path.slice(0,endOfParameter) + "}" 
                                        + endpointControllerObject.path.slice(endOfParameter)

    return URIparameterName
}

function setParameters(endpointControllerObject, hasURIParameter, URIparameterName){

    openAPIdoc.paths[endpointControllerObject.path][endpointControllerObject.method]['parameters'] = []
    if(endpointControllerObject.request){
        openAPIRequestSchema = {}
        requestSchema = endpointControllerObject.request.body.schema

        buildOpenAPISchema(openAPIRequestSchema, requestSchema)
        requestName = endpointControllerObject.request.hasOwnProperty('name') ? endpointControllerObject.request.name:""
        requestDescription = endpointControllerObject.request.hasOwnProperty('description') ? endpointControllerObject.request.description:""

        openAPIdoc.paths[endpointControllerObject.path][endpointControllerObject.method]['parameters'] = 
                    [{name: requestName, in: 'body', description: requestDescription, 
                    required: true, schema: openAPIRequestSchema}]
    }
    if(hasURIParameter){
        openAPIdoc.paths[endpointControllerObject.path][endpointControllerObject.method]['parameters'].push({
            name:URIparameterName, in:"path", description:"", type: "string", required: true
        })
    }
}

function setResponses(endpointControllerObject){

    openAPIdoc.paths[endpointControllerObject.path][endpointControllerObject.method]['responses'] = {default: {description:'none'}}
    if(endpointControllerObject.response){
        openAPIResponseSchema = {}
        responseSchema = endpointControllerObject.response.body.schema
        buildOpenAPISchema(openAPIResponseSchema, responseSchema)
        responseDescription = endpointControllerObject.response.hasOwnProperty('description') ? endpointControllerObject.response.description:""

        openAPIdoc.paths[endpointControllerObject.path][endpointControllerObject.method]['responses'] = 
            {200: {description:responseDescription, schema:openAPIResponseSchema}} 
    }
}

/**
 * This function initializes the openAPI YAML structure
 * Must be called before generateAPIDefinition()
 * input:   
 *      options should have the basic information of your API (e.g: host, base path, etc)
 */
module.exports.intializateAPIDefinition = (options) => {
    openAPIdoc.swagger = '2.0'
    openAPIdoc.info = {description: options.description, version: options.version, title: options.title}
    openAPIdoc.host = options.host
    openAPIdoc.basePath = options.base
    openAPIdoc.tags = []
    openAPIdoc.paths = {}
}
 
 /**
  * Input:
  *     A valid endpoint descriptor with the following properties: path, method and request(optional) 
  *     intializateAPIDefinition() must be called before the first call of this function
  * Output:
  *     Create a file named API_definition.yml in the  current directory, containing the yaml structure for the swagger viewer
  *     Return a valid javascript object for the Swagger editor
  * 
  * Given an endpoint descriptor object, this function will add the corresponding substructures into openAPIdoc
  * Should be called for each *-controller.js file in the project to get the complete yaml file.
  */
module.exports.generateAPIDefinition = (endpointControllerObject) => {

    tagDescription = endpointControllerObject.hasOwnProperty('descritpion') ? endpointControllerObject.description: ""
    hasURIParameter = (endpointControllerObject.path.indexOf(':') != -1)
    URIparameterName = ""
    updateTags(endpointControllerObject)

    if(hasURIParameter){
        URIparameterName = translatePathIntoOpenAPISyntax(endpointControllerObject)
    }

    openAPIdoc.paths[endpointControllerObject.path] = {}
    openAPIdoc.paths[endpointControllerObject.path][endpointControllerObject.method] = {}
    openAPIdoc.paths[endpointControllerObject.path][endpointControllerObject.method]['tags'] = [(newTagName==="")?"":newTagName]

    setParameters(endpointControllerObject, hasURIParameter, URIparameterName)
    setResponses(endpointControllerObject)
    
    fs.writeFile('./API_definition.yml', yaml.safeDump(openAPIdoc), (err) => {
        if (err) {
            console.log(err)
            throw new Error('API_definition.yml was not successfully created')
        }
    })

    return openAPIdoc

}
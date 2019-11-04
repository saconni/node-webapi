let fs = require('fs')
let yaml = require('js-yaml');

//This represents the YAML structure for the Swagger editor
let openAPIdoc = {} 

/**
 * Build recursively the "schema" section of the openAPIdoc YAML
 *
 * Input: webapiSchema -> a valid web-api schema for the endpoint
 * Input/Output: openAPISchema -> the partial open api schema
 */
function build_OpenAPI_Schema(openAPISchema, webapiSchema){
  
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
                    build_OpenAPI_Schema(openAPISchema['properties'][schemaProperty], webapiSchema[schemaProperty]['schema'])
                }else{
                    //it's a simple property with the "type" as the only information
                    openAPISchema['properties'][schemaProperty] = {type: webapiSchema[schemaProperty]}
                }
            }else{
                if(webapiSchema[schemaProperty]['type'] == 'array'){
                    arrayItemsSchema = {}
                    build_OpenAPI_Schema(arrayItemsSchema, webapiSchema[schemaProperty]['items']['schema'])
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
  * 
  * Given an endpoint descriptor object, this function will add the corresponding substructures into openAPIdoc
  * Should be called for each *-controller.js file in the project to get the complete yaml file.
  */
module.exports.generateAPIDefinition = (endpointControllerObject) => {

    openAPIdoc.tags.push({name: endpointControllerObject.path.replace('/',''), description: endpointControllerObject.description})
    openAPIdoc.paths[endpointControllerObject.path] = {}
    openAPIdoc.paths[endpointControllerObject.path][endpointControllerObject.method] = {}
    openAPIdoc.paths[endpointControllerObject.path][endpointControllerObject.method]['tags'] = [endpointControllerObject.path.replace('/','')]

    openAPIdoc.paths[endpointControllerObject.path][endpointControllerObject.method]['parameters'] = []
    if(endpointControllerObject.request) {
        openAPIRequestSchema = {}
        requestSchema = endpointControllerObject.request.body.schema

        build_OpenAPI_Schema(openAPIRequestSchema, requestSchema)
        openAPIdoc.paths[endpointControllerObject.path][endpointControllerObject.method]['parameters'] = 
                    [{name: endpointControllerObject.request.name, in: 'body', 
                    description: endpointControllerObject.request.description, required: true, schema: openAPIRequestSchema}]
    }

    openAPIdoc.paths[endpointControllerObject.path][endpointControllerObject.method]['responses'] = {default: {description:'none'}}
    if(endpointControllerObject.response) {
        openAPIResponseSchema = {}
        responseSchema = endpointControllerObject.response.body.schema
        build_OpenAPI_Schema(openAPIResponseSchema, responseSchema)
        openAPIdoc.paths[endpointControllerObject.path][endpointControllerObject.method]['responses'] = 
            {200: {description:endpointControllerObject.response.description, schema:openAPIResponseSchema}} 
    }
    
    fs.writeFile('./API_definition.yml', yaml.safeDump(openAPIdoc), (err) => {
        if (err) {
            console.log(err)
            throw new Error('API_definition.yml was not successfully created')
        }
    })

}
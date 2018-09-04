var mammoth = require("mammoth");

var fs = require('fs');
var util = require('util');

var assetDir = "./web/assets"

function writeToFile(filename, content) {
    return  new Promise((resolve, reject) => {
        fs.writeFile(filename, content, function(err) {
            if(err) {
               reject(err);
            }
            resolve();
            //console.log("The file was saved!");
        });
    })
}


function getOptions(dirname) {
    var number = 1;
    var options = {
        convertImage: mammoth.images.imgElement(function(image) {
            return image.read().then(function(imageBuffer) {
                var fileType = image.contentType.replace("image/","");
                var content = imageBuffer;
                var filename = number.toString()+"."+fileType
                var imgPath =  "/assets/" + dirname + "/" +filename;
                number = number + 1;
                writeToFile( assetDir + "/" + dirname + "/" +filename, content).then(()=>{
                    
                }).catch((err)=>{
                    console.log(err);
                });

                return {
                    height: image.size.height,
                    width: image.size.width,
                    src: imgPath
                };
            });
        })
    };

    return options;
}

function convertDocxToHtml(dir, path) {
    var options = getOptions(dir);
    if (!fs.existsSync(assetDir + "/" + dir)){
        fs.mkdirSync(assetDir + "/" + dir);
    }
    return new Promise((resolve, reject) => {
        mammoth.convertToHtml({path: path}, options).then(function(result){
            var text = result.value;
            resolve(text);
        }).done();
    })
}

exports.convertDocxToHtml = convertDocxToHtml;




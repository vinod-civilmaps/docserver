var _ = require("underscore");

var documents = require("../documents");
var Result = require("../results").Result;
var util = require('util');

var emptyResult = require('./body-reader').emptyResult;
var elementResult = require("./body-reader").elementResult;
var combineResults = require("./body-reader").combineResults;

function createWordGroupReader(bodyReader) {

    var xmlElementReaders = {
        "wpg:grpSpPr" :  function(element) {
            var props = getProps(element);
            return _.extend({}, {type: "wordGroupProperties"}, props);
        },
        "pic:pic": function(element) {
            var image = bodyReader.readXmlElement(element);
            var props = getProps(element.getElementsByTagName("pic:spPr")[0]);
            return elementResult({
                type: "image",
                children: image.value,
                properties: props
            });
        },
        "wps:wsp": function(element) {
            var boxEle = element
                            .getElementsByTagName("wps:spPr")[0];
            var boxInfo = getBoxDetails(boxEle);

            var textEle = element
                            .getElementsByTagName("wps:txbx")
                            .getElementsByTagName("w:txbxContent")[0];
            
            var textR = bodyReader.readXmlElement(textEle);


            return elementResult({
                type: "box",
                properties: boxInfo,
                children: textR.value
            });
        }
    }

    function getBoxDetails(boxEle) {
        var boxProps = getProps(boxEle);

        var boxinfo = {};

        boxinfo["type"] = "custom";

        var boxTypeEle = boxEle.getElementsByTagName("a:prstGeom");
        if (boxTypeEle.length > 0) {
            var boxType = boxTypeEle[0].attributes.prst;
            boxinfo["type"] = boxType
        }
        

        var boxColorEle = boxEle.getElementsByTagName("a:solidFill");
        var boxFillColor = "rgba(0,0,0,0)"
        if (boxColorEle.length > 0) {
            boxFillColor = "#" + boxColorEle[0].getElementsByTagName("a:srgbClr")[0].attributes.val;
        }
        boxinfo["bgColor"] = boxFillColor

        
        var borderInfo = {};
        var boxBorderLine = boxEle.getElementsByTagName("a:ln")[0];
        var boxBorderColorEle = boxBorderLine.getElementsByTagName("a:solidFill");
        var boxBorderColor = "rgba(0,0,0,0)"
        if (boxBorderColorEle.length > 0) {
            boxBorderColor ="#" + boxBorderColorEle[0].getElementsByTagName("a:srgbClr")[0].attributes.val;
        }
        borderInfo["color"] = boxBorderColor;

        var boxBorderType = "solid";
        var boxDshEle = boxBorderLine.getElementsByTagName("a:prstDash");
        if (boxDshEle.length > 0) {
            boxBorderType = boxDshEle[0].attributes.val;
        }
        borderInfo["type"] = boxBorderType;

        var boxBorderHead = "none";
        var headEle = boxBorderLine.getElementsByTagName("a:headEnd");
        if (headEle.length > 0) {
            boxBorderHead = headEle[0].attributes.type;
        }
        borderInfo["head"] = boxBorderHead;

        var boxBorderTile = "none";
        var tailEle = boxBorderLine.getElementsByTagName("a:tailEnd");
        if (tailEle.length > 0) {
            boxBorderTile = tailEle[0].attributes.type;
        }
        borderInfo["tail"] = boxBorderTile;
        boxinfo["border"] = borderInfo;
        
        boxinfo = _.extend({}, boxinfo, boxProps);

        return boxinfo;
    }

    function getProps(element) {
        var oEle = element;
        var element = element.getElementsByTagName("a:xfrm")[0];

        var dim = element.firstOrEmpty("a:ext")
        var rot = 0;

        if (element.first("a:chExt")) {
            dim = element.firstOrEmpty("a:chExt");
        }
        if (oEle.first("a:xfrm").attributes["rot"]) {
            rot = oEle.first("a:xfrm").attributes["rot"];
        }
        var pos = element.firstOrEmpty("a:off")
        return {
            width: Math.ceil(dim.attributes["cx"]/9525),
            height: Math.ceil(dim.attributes["cy"]/9525),
            x: Math.ceil((pos.attributes["x"])/9525),
            y: Math.ceil((pos.attributes["y"])/9525),
            rotation:  Math.ceil((rot)/60000),
        };
    }

    function isWordGroupProperties(element) {
        return element.type === "wordGroupProperties";
    }

    function readXmlElement(element) {
        if (element.type === "element") {
            var handler = xmlElementReaders[element.name];
            if (handler) {
                return handler(element);
            }
            // else if (!Object.prototype.hasOwnProperty.call(ignoreElements, element.name)) {
            //     var message = warning("An unrecognised element was ignored: " + element.name);
            //     return bodyReader.emptyResultWithMessages([message]);
            // }
        }
        return emptyResult();
    }

    function negate(predicate) {
        return function(value) {
            return !predicate(value);
        };
    }

    function readWordGroupElement(element) {
        uri = element.attributes.uri;
        
        function readOptionalAttribute(name) {
            return (element.attributes[name] || "").trim() || null;
        }
        var wgp = element.getElementsByTagName("wpg:wgp");

        var results = wgp[0].children.map(readXmlElement)
        
        var properties = _.find(results, isWordGroupProperties);
        var children = results.filter(negate(isWordGroupProperties));
        var children = combineResults(children);

        return elementResult(new documents.Canvas(children.value, properties));
    }
    
    return readWordGroupElement;
}

exports.createWordGroupReader = createWordGroupReader;
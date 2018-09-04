var _ = require("underscore");

var promises = require("./promises");
var documents = require("./documents");
var htmlPaths = require("./styles/html-paths");
var results = require("./results");
var images = require("./images");
var Html = require("./html");
var writers = require("./writers");

var util = require("util");

exports.DocumentConverter = DocumentConverter;


function DocumentConverter(options) {
    return {
        convertToHtml: function(element) {
            var comments = _.indexBy(
                element.type === documents.types.document ? element.comments : [],
                "commentId"
            );
            var conversion = new DocumentConversion(options, comments);
            return conversion.convertToHtml(element);
        }
    };
}

function DocumentConversion(options, comments) {
    var noteNumber = 1;
    
    var noteReferences = [];
    
    var referencedComments = [];
    
    options = _.extend({ignoreEmptyParagraphs: true}, options);
    var idPrefix = options.idPrefix === undefined ? "" : options.idPrefix;
    var ignoreEmptyParagraphs = options.ignoreEmptyParagraphs;
    
    var defaultParagraphStyle = htmlPaths.topLevelElement("p");
    
    var styleMap = options.styleMap || [];
    
    function convertToHtml(document) {
        var messages = [];
        
        var html = elementToHtml(document, messages, {});
        
        var deferredNodes = [];
        walkHtml(html, function(node) {
            if (node.type === "deferred") {
                deferredNodes.push(node);
            }
        });
        var deferredValues = {};
        return promises.mapSeries(deferredNodes, function(deferred) {
            return deferred.value().then(function(value) {
                deferredValues[deferred.id] = value;
            });
        }).then(function() {
            function replaceDeferred(nodes) {
                return flatMap(nodes, function(node) {
                    if (node.type === "deferred") {
                        return deferredValues[node.id];
                    } else if (node.children) {
                        return [
                            _.extend({}, node, {
                                children: replaceDeferred(node.children)
                            })
                        ];
                    } else {
                        return [node];
                    }
                });
            }
            var writer = writers.writer({
                prettyPrint: options.prettyPrint,
                outputFormat: options.outputFormat
            });
            Html.write(writer, Html.simplify(replaceDeferred(html)));
            return new results.Result(writer.asString(), messages);
        });
    }
    
    function convertElements(elements, messages, options) {
        return flatMap(elements, function(element) {
            return elementToHtml(element, messages, options);
        });
    }

    function elementToHtml(element, messages, options) {
        if (!options) {
            throw new Error("options not set");
        }
        var handler = elementConverters[element.type];
        if (handler) {
            return handler(element, messages, options);
        } else {
            return [];
        }
    }
    
    function convertParagraph(element, messages, options) {
        return htmlPathForParagraph(element, messages).wrap(function() {
            var content = convertElements(element.children, messages, options);
            if (ignoreEmptyParagraphs) {
                return content;
            } else {
                return [Html.forceWrite].concat(content);
            }
        });
    }
    
    function htmlPathForParagraph(element, messages) {
        var style = findStyle(element);
        
        if (style) {
            return style.to;
        } else {
            if (element.styleId) {
                messages.push(unrecognisedStyleWarning("paragraph", element));
            }
            return defaultParagraphStyle;
        }
    }
    
    function convertRun(run, messages, options) {
        var nodes = function() {
            return convertElements(run.children, messages, options);
        };
        var paths = [];
        if (run.isSmallCaps) {
            paths.push(findHtmlPathForRunProperty("smallCaps"));
        }
        if (run.isStrikethrough) {
            paths.push(findHtmlPathForRunProperty("strikethrough", "s"));
        }
        if (run.isUnderline) {
            paths.push(findHtmlPathForRunProperty("underline"));
        }
        if (run.verticalAlignment === documents.verticalAlignment.subscript) {
            paths.push(htmlPaths.element("sub", {}, {fresh: false}));
        }
        if (run.verticalAlignment === documents.verticalAlignment.superscript) {
            paths.push(htmlPaths.element("sup", {}, {fresh: false}));
        }
        if (run.isItalic) {
            paths.push(findHtmlPathForRunProperty("italic", "em"));
        }
        if (run.isBold) {
            paths.push(findHtmlPathForRunProperty("bold", "strong"));
        }
        var stylePath = htmlPaths.empty;
        var style = findStyle(run);
        if (style) {
            stylePath = style.to;
        } else if (run.styleId) {
            messages.push(unrecognisedStyleWarning("run", run));
        }
        paths.push(stylePath);

        //console.log("--------------Paths---------------------- ", util.inspect(paths, false, null));

            
        paths.forEach(function(path) {
            nodes = path.wrap.bind(path, nodes);
        });

        var attributes = {style:""}

        if (run.color != null) {
            attributes.style += "color:#" + run.color+";";
        }

        if (run.highlight != null) {
            attributes.style += "background:" + run.highlight+";";
        }

        if (run.fontSize != null) {
            attributes.style += "font-size:" + (run.fontSize/2).toString() +"pt;";
        }

        if (run.font != null) {
            attributes.style += "font-family:" + run.font +";";
        }

        //var children = nodes();

        //console.log("nodes ---- ", Html.freshElement("span", attributes, nodes()), util.inspect(nodes(), false, null) );

        return [Html.freshElement("span", attributes, nodes())];
        
        //return nodes();
    }
    
    function findHtmlPathForRunProperty(elementType, defaultTagName) {
        var path = findHtmlPath({type: elementType});
        if (path) {
            return path;
        } else if (defaultTagName) {
            return htmlPaths.element(defaultTagName, {}, {fresh: false});
        } else {
            return htmlPaths.empty;
        }
    }
    
    function findHtmlPath(element, defaultPath) {
        var style = findStyle(element);
        return style ? style.to : defaultPath;
    }
    
    function findStyle(element) {
        for (var i = 0; i < styleMap.length; i++) {
            if (styleMap[i].from.matches(element)) {
                return styleMap[i];
            }
        }
    }
    
    function recoveringConvertImage(convertImage) {
        return function(image, messages) {
            return promises.attempt(function() {
                return convertImage(image, messages);
            }).caught(function(error) {
                messages.push(results.error(error));
                return [];
            });
        };
    }

    function noteHtmlId(note) {
        return referentHtmlId(note.noteType, note.noteId);
    }
    
    function noteRefHtmlId(note) {
        return referenceHtmlId(note.noteType, note.noteId);
    }
    
    function referentHtmlId(referenceType, referenceId) {
        return htmlId(referenceType + "-" + referenceId);
    }
    
    function referenceHtmlId(referenceType, referenceId) {
        return htmlId(referenceType + "-ref-" + referenceId);
    }
    
    function htmlId(suffix) {
        return idPrefix + suffix;
    }
    
    var defaultTablePath = htmlPaths.elements([
        htmlPaths.element("table", {}, {fresh: true})
    ]);

    function convertTable(element, messages, options) {
        return findHtmlPath(element, defaultTablePath).wrap(function() {
            return convertTableChildren(element, messages, options);
        });
    }

    function convertTableChildren(element, messages, options) {
        var bodyIndex = _.findIndex(element.children, function(child) {
            return !child.type === documents.types.tableRow || !child.isHeader;
        });
        if (bodyIndex === -1) {
            bodyIndex = element.children.length;
        }
        var children;
        if (bodyIndex === 0) {
            children = convertElements(
                element.children,
                messages,
                _.extend({}, options, {isTableHeader: false})
            );
        } else {
            var headRows = convertElements(
                element.children.slice(0, bodyIndex),
                messages,
                _.extend({}, options, {isTableHeader: true})
            );
            var bodyRows = convertElements(
                element.children.slice(bodyIndex),
                messages,
                _.extend({}, options, {isTableHeader: false})
            );
            children = [
                Html.freshElement("thead", {}, headRows),
                Html.freshElement("tbody", {}, bodyRows)
            ];
        }
        return [Html.forceWrite].concat(children);
    }
    
    function convertTableRow(element, messages, options) {
        return wrapChildrenInFreshElement(element, "tr", messages, options);
    }
    
    function convertTableCell(element, messages, options) {
        var tagName = options.isTableHeader ? "th" : "td";
        var children = convertElements(element.children, messages, options);
        var attributes = {};
        if (element.colSpan !== 1) {
            attributes.colspan = element.colSpan.toString();
        }
        if (element.rowSpan !== 1) {
            attributes.rowspan = element.rowSpan.toString();
        }
            
        return [
            Html.freshElement(tagName, attributes, [Html.forceWrite].concat(children))
        ];
    }
    
    function convertCommentReference(reference, messages, options) {
        return findHtmlPath(reference, htmlPaths.ignore).wrap(function() {
            var comment = comments[reference.commentId];
            var count = referencedComments.length + 1;
            var label = "[" + commentAuthorLabel(comment) + count + "]";
            referencedComments.push({label: label, comment: comment});
            // TODO: remove duplication with note references
            return [
                Html.freshElement("a", {
                    href: "#" + referentHtmlId("comment", reference.commentId),
                    id: referenceHtmlId("comment", reference.commentId)
                }, [Html.text(label)])
            ];
        });
    }
    
    function convertComment(referencedComment, messages, options) {
        // TODO: remove duplication with note references
        
        var label = referencedComment.label;
        var comment = referencedComment.comment;
        var body = convertElements(comment.body, messages, options).concat([
            Html.nonFreshElement("p", {}, [
                Html.text(" "),
                Html.freshElement("a", {"href": "#" + referenceHtmlId("comment", comment.commentId)}, [
                    Html.text("↑")
                ])
            ])
        ]);
        
        return [
            Html.freshElement(
                "dt",
                {"id": referentHtmlId("comment", comment.commentId)},
                [Html.text("Comment " + label)]
            ),
            Html.freshElement("dd", {}, body)
        ];
    }
    
    function convertBreak(element, messages, options) {
        return htmlPathForBreak(element).wrap(function() {
            return [];
        });
    }

    function convertHr(element, messages, options) {
        var attributes = {style:""}

        if (element.color != null) {
            attributes.style += "border-top-color:" + element.color+";";
        }

        return [Html.freshElement("hr", attributes, [])];
    }
    
    function htmlPathForBreak(element) {
        var style = findStyle(element);
        if (style) {
            return style.to;
        } else if (element.breakType === "line") {
            return htmlPaths.topLevelElement("br");
        } else {
            return htmlPaths.empty;
        }
    }
    
    function wrapChildrenInFreshElement(element, wrapElementName, messages, options) {
        var children = convertElements(element.children, messages, options);
        return [
            Html.freshElement(wrapElementName, {}, [Html.forceWrite].concat(children))
        ];
    }

    function convertCanvas(element) {
        var id = Date.now().toString();
        var attributes = {style: "", id:id};
        var props = element.properties;

        attributes["width"] = (props.width +100).toString();
        attributes["height"] = (props.height + 100).toString();

        var scAtr = {type:"text/javascript"};
        var script = `
            var canvas_${id} = document.getElementById("${id}");
            var context_${id} = canvas_${id}.getContext("2d");
            
            // context_${id}.fillStyle = "blue";
            // context_${id}.font = "bold 16px Arial";
            // context_${id}.fillText("Zibri", (canvas_${id}.width / 2) - 17, (canvas_${id}.height / 2) + 8);
        `;

        var imgPr = [];
        for (var i =0; i < element.children.length; i++) {
            var cEle = element.children[i];
            if (cEle.type == "box") {
                var props = cEle.properties;
                var posX = Math.round((props.x));
                var posY = Math.round((props.y));

                if (props.type.toLowerCase().indexOf("rect") > -1) {
                    script += `
                        context_${id}.fillStyle = "${props.bgColor}";
                        context_${id}.fillRect(${posX}, ${posY}, ${props.width}, ${props.height});
                    `
                }

                if (cEle.children.length > 0) {
                    for (let i=0; i< cEle.children.length; i++) {
                        let para = cEle.children[i];
                        let x = posX;
                        let rand = Math.random().toString(36).substring(7);//Date.now();
                        script += `var x_${rand} = ${posX}`;
                        for (let j = 0; j < para.children.length; j++) {
                            let text = para.children[j];
                            if (text.children.length > 0) {
                                let val = text.children[0].value.trim();
                                script += `
                                    let txt_${rand}_${i}_${j} = '${val}';
                                    context_${id}.font = '${text.fontSize/2}px Arial';
                                    context_${id}.fillStyle = "#${text.color}";
                                   // context_${id}.textAlign = "justify";
                                    context_${id}.fillText('${val}', x_${rand}, ${posY+i*(text.fontSize/2)});
                                    x_${rand} += context_${id}.measureText(txt_${rand}_${i}_${j}).width;
                                `
                            }
                        }
                    }
                }

                if (props.type.toLowerCase().indexOf("rect") > -1 
                    && props.border) {
                    var border = props.border;
                    script += `
                        context_${id}.strokeStyle = "${border.color}";
                        context_${id}.strokeWidth = 1;
                        context_${id}.strokeRect(${posX}, ${posY}, ${props.width}, ${props.height});
                    `
                }

                // if (
                //     (
                //         props.type.toLowerCase().indexOf("connector") > -1
                //     )
                //     && props.border) {
                //     var border = props.border;
                //     var startPoint = {
                //         x: posX,
                //         y: posY
                //     }
                //     var endPoint = {
                //         x: posX + props.width,
                //         y: posY + props.height
                //     }
                //     midPoint = {
                //         x: startPoint.x + (endPoint.x - startPoint.x) * 0.5,
                //         y: startPoint.y + (endPoint.y - startPoint.y) * 0.5
                //     };
                //     script += `
                //         context_${id}.save()
                //         context_${id}.beginPath();
                //         context_${id}.strokeStyle="${border.color}";
                        
                //         context_${id}.translate(${midPoint.x}, ${midPoint.y});
  
                //         // rotate some angle (radians)
                //         context_${id}.rotate(${props.rotation});  // = 45°
                        
                //         // translate back
                //         context_${id}.translate(${-midPoint.x}, ${-midPoint.y});

                //         context_${id}.moveTo(${posX}, ${posY});
                //         context_${id}.lineTo(${posX + props.width}, ${posY + props.height});
                //         context_${id}.stroke();
                //         context_${id}.closePath();
                //         context_${id}.restore() 
                //     `
                // }
                
            }

            if (cEle.type == "image") {
               

                var k = () => {
                    var props = cEle.properties;
                    var posX = Math.round((props.x));
                    var posY = Math.round((props.y));
                    var image = cEle.children[0];
                    return image.read("base64").then((imageBuffer) => {
                            script += `
                                var image_${imgPr.length+1} = new Image();
                                image_${imgPr.length+1}.onload = function() {
                                    context_${id}.save()
                                    //context_${id}.translate(${posX}, );
                                    context_${id}.drawImage(image_${imgPr.length+1}, ${posX}, ${posY});
                                    context_${id}.restore(); 
                                };
                                image_${imgPr.length+1}.src = "data:${image.contentType};base64,${imageBuffer}"
                            `
                        }).catch(e => {
                        })
                }

                imgPr.push(k());
            }
        }

        var fn = function() {
            return promises.attempt(function() {
                if (imgPr.length > 0) {
                    return promises.all(imgPr).then(()=>{
                        var res = [Html.freshElement('div', {}, [Html.freshElement("canvas", attributes, []), Html.freshElement("script", scAtr, [Html.text(script)])])]
                        return new Promise(function(resolve, reject) {
                            resolve(res);
                        })
                    });
                } else {
                    var res = [Html.freshElement('div', {}, [Html.freshElement("canvas", attributes, []), Html.freshElement("script", scAtr, [Html.text(script)])])];
                    return new Promise(function(resolve, reject) {
                        resolve(res);
                    })
                }
                
            }).caught(function(error) {
                //messages.push(results.error(error));
                return [];
            });
        };

        return fn();
    }

    var elementConverters = {
        "document": function(document, messages, options) {
            var children = convertElements(document.children, messages, options);
            var notes = noteReferences.map(function(noteReference) {
                return document.notes.resolve(noteReference);
            });
            var notesNodes = convertElements(notes, messages, options);
            return children.concat([
                Html.freshElement("ol", {}, notesNodes),
                Html.freshElement("dl", {}, flatMap(referencedComments, function(referencedComment) {
                    return convertComment(referencedComment, messages, options);
                }))
            ]);
        },
        "paragraph": convertParagraph,
        "run": convertRun,
        "text": function(element, messages, options) {
            return [Html.text(element.value)];
        },
        "tab": function(element, messages, options) {
            return [Html.text("\t")];
        },
        "hyperlink": function(element, messages, options) {
            var href = element.anchor ? "#" + htmlId(element.anchor) : element.href;
            var attributes = {href: href};
            if (element.targetFrame != null) {
                attributes.target = element.targetFrame;
            }

            var children = convertElements(element.children, messages, options);
            return [Html.freshElement("a", attributes, children)];
        },
        "bookmarkStart": function(element, messages, options) {
            var anchor = Html.freshElement("a", {
                id: htmlId(element.name)
            }, [Html.forceWrite]);
            return [anchor];
        },
        "noteReference": function(element, messages, options) {
            noteReferences.push(element);
            var anchor = Html.freshElement("a", {
                href: "#" + noteHtmlId(element),
                id: noteRefHtmlId(element)
            }, [Html.text("[" + (noteNumber++) + "]")]);
            
            return [Html.freshElement("sup", {}, [anchor])];
        },
        "note": function(element, messages, options) {
            var children = convertElements(element.body, messages, options);
            var backLink = Html.elementWithTag(htmlPaths.element("p", {}, {fresh: false}), [
                Html.text(" "),
                Html.freshElement("a", {href: "#" + noteRefHtmlId(element)}, [Html.text("↑")])
            ]);
            var body = children.concat([backLink]);
            
            return Html.freshElement("li", {id: noteHtmlId(element)}, body);
        },
        "commentReference": convertCommentReference,
        "comment": convertComment,
        "image": deferredConversion(recoveringConvertImage(options.convertImage || images.dataUri)),
        "table": convertTable,
        "tableRow": convertTableRow,
        "tableCell": convertTableCell,
        "break": convertBreak,
        "hr": convertHr,
        "canvas": deferredConversion(convertCanvas)
    };
    return {
        convertToHtml: convertToHtml
    };
}

var deferredId = 1;

function deferredConversion(func) {
    return function(element, messages, options) {
        return [
            {
                type: "deferred",
                id: deferredId++,
                value: function() {
                    return func(element, messages, options);
                }
            }
        ];
    };
}

function unrecognisedStyleWarning(type, element) {
    return results.warning(
        "Unrecognised " + type + " style: '" + element.styleName + "'" +
        " (Style ID: " + element.styleId + ")"
    );
}

function flatMap(values, func) {
    return _.flatten(values.map(func), true);
}

function walkHtml(nodes, callback) {
    nodes.forEach(function(node) {
        callback(node);
        if (node.children) {
            walkHtml(node.children, callback);
        }
    });
}

var commentAuthorLabel = exports.commentAuthorLabel = function commentAuthorLabel(comment) {
    return comment.authorInitials || "";
};

var request = require('request');

var username = "vinod@civilmaps.com"
var password = "vinod@civil"
var auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');

function getConfHtml(pageId) {
    var confUrl = "https://civilmaps.atlassian.net/wiki/plugins/viewsource/viewpagesrc.action?pageId=" + pageId
    var options = {
        host: "civilmaps.atlassian.net",
        path: "/wiki/plugins/viewsource/viewpagesrc.action?pageId=" + pageId,
        method: 'GET',
        auth: auth
      };
    return new Promise((resolve, reject) => {

        request(
            {
                url : confUrl,
                headers : {
                    "Authorization" : auth
                }
            },
            function (error, response, body) {
                // Do more stuff with 'body' here
                if (error != null) {
                    reject(error);
                } else {
                    resolve(body);
                }
               
            }
        );
    });
}

exports.getConfHtml=getConfHtml;
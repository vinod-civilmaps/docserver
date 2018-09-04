const express = require('express')
const app = express()
const path = require('path');
const bodyParser = require('body-parser')
const formidable = require('formidable')
const fs = require('fs')
//const multer = require('multer');
const oursol = require("./api/oursol");
const confsol = require("./api/confsol");



console.log(path.join(__dirname, 'web'))

app.use(express.static(path.join(__dirname, 'web')));

//app.use(bodyParser.urlencoded());
app.use(bodyParser.json());
//app.use(bodyParser());

//app.use(multer({ dest: path.join(__dirname, 'web')}));

app.set('views', path.join(__dirname, '/web/views'));

app.set('view engine', 'ejs');


app.get('/', (req, res) => res.render("pages/app"))

app.get('/oursolution', function (req, res) {
    res.render("pages/oursol");
});

app.post('/api/oursolution', function (req, res) {
    

    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, files) {
        // `file` is the name of the <input> field of type `file`
        var old_path = files.file.path,
            file_size = files.file.size,
            file_ext = files.file.name.split('.').pop(),
            index = old_path.lastIndexOf('/') + 1,
            file_name = files.file.name,
            new_path = path.join(process.env.PWD, '/tmp/', file_name + '.' + file_ext);
        
            console.log(new_path);

        fs.readFile(old_path, function(err, data) {
            fs.writeFile(new_path, data, function(err) {
                fs.unlink(old_path, function(err) {
                    if (err) {
                        res.status(500);
                        res.json({'success': false});
                    } else {
                        
                        oursol.convertDocxToHtml(file_name, new_path).then((html) => {
                            res.status(200);
                            res.json({'success': true, 'html': html});
                        })
                    }
                });
            });
        });
    });

    //res.send("API OURSOL");
});

app.post("/api/confsol", function(req, res){
    console.log("page id", req.body);
    confsol.getConfHtml(req.body.pageId).then((html)=>{
        res.status(200);
        res.json({'success': true, 'html': html});
    }).catch((err) => {
        res.status(500);
        res.json({'success': false});
    })
});

app.get('/confsolution', function (req, res) {
    res.render("pages/confsol");
});

app.listen(9000, () => console.log('Example app listening on port 9000!'))
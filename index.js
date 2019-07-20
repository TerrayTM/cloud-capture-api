const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io').listen(server);
const upload = require('multer')();
const cors = require('cors');
const fs = require('fs');
const rimraf = require('rimraf');
const bodyParser = require('body-parser');
const { password } = require('./config');

const rooms = new Map();
const connections = new Map();
const maxUploadSize = 26214400;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get('/', (_, res) => {
    res.send('Server Online!');
});

app.post('/wake', (req, res) => {
    if (!req.body || !req.body.identifier) {
        res.send('ERROR_BAD_PARAMS');
    } else {
        res.send(req.body.identifier.toString());
    }
});

app.post('/services/upload', upload.single('file'), (req, res) => {
    if (!req.body || !req.body.id || !req.file || !req.body.password) {
        res.send('ERROR_BAD_PARAMS');
        return;
    }
    if (req.body.password !== password) {
        res.send('ERROR_BAD_PASSWORD');
        return;
    }
    if (!rooms.has(req.body.id)) {
        res.send('ERROR_BAD_ROOM_ID');
        return;
    }
    if (req.file.size > maxUploadSize) {
        res.send('ERROR_FILE_TOO_LARGE');
        return;
    }
    fs.writeFile(`${__dirname}/container/${req.body.id}/${req.file.originalname}`, req.file.buffer, (error) => {});
    io.to(req.body.id).emit('updateFile', req.file.originalname, req.file.mimetype, req.file.buffer);
    res.send('SUCCESS');
});

app.post('/services/room', upload.none(), (req, res) => {
    if (!req.body || !req.body.id) {
        res.send('ERROR_BAD_PARAMS');
        return;
    }
    if (rooms.has(req.body.id)) {
        res.send('VALID');
        return;
    }
    res.send('INVALID');
});

io.on('connection', (socket) => {
    connections.set(socket.id, null);

    socket.on('joinRoom', (id) => {
        if (connections.get(socket.id)) {
            const previousRoom = connections.get(socket.id);
            socket.leave(previousRoom);
            if (rooms.get(previousRoom) == 1) {
                rimraf(`${__dirname}/container/${previousRoom}`, (error) => {});
                rooms.delete(previousRoom);
            } else {
                const updateUsers = rooms.get(previousRoom) - 1;
                rooms.set(previousRoom, updateUsers);
                io.to(previousRoom).emit('updateOnlineUsers', updateUsers);
            }
        }
        if (!rooms.has(id)) {
            rooms.set(id, 0);
            fs.mkdir(`${__dirname}/container/${id}`, (error) => {});
        }
        const users = rooms.get(id) + 1;
        rooms.set(id, users);
        socket.join(id);
        connections.set(socket.id, id);
        io.to(id).emit('updateOnlineUsers', users);
        fs.readdir(`${__dirname}/container/${id}`, (error, files) => {
            files.forEach(element => {
                fs.readFile(`${__dirname}/container/${id}/${element}`, (error, data) => {
                    if (!connections.has(socket.id) || error) {
                        return;
                    }
                    let type = element.split('.');
                    type = type[type.length - 1];
                    socket.emit('updateFile', element, ['png', 'jpeg', 'jpg', 'gif', 'bmp'].includes(type) ? 'image' : 'file', data);
                });
            });
        });
    });

    socket.on('disconnect', () => {
        const room = connections.get(socket.id);
        if (room) {
            if (rooms.get(room) == 1) {
                rimraf(`${__dirname}/container/${room}`, (error) => {});
                rooms.delete(room);
            } else {
                const users = rooms.get(room) - 1;
                rooms.set(room, users);
                io.to(room).emit('updateOnlineUsers', users);
            }
        }
        connections.delete(socket.id);
    });
});

server.listen(3000);
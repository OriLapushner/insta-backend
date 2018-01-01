// Minimal Simple REST API Handler (With MongoDB and Socket.io)
// Plus support for simple login and session
// Plus support for file upload
// Author: Yaron Biton misterBIT.co.il

"use strict";

var cl = console.log;

const express = require('express'),
	bodyParser = require('body-parser'),
	cors = require('cors'),
	mongodb = require('mongodb')

const clientSessions = require("client-sessions");
const upload = require('./uploads');
const app = express();

var corsOptions = {
	origin: /http:\/\/localhost:\d+/,
	credentials: true
};

const serverRoot = 'http://localhost:3003/';
const baseUrl = serverRoot + 'data';

app.use(express.static('uploads'));


app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(clientSessions({
	cookieName: 'session',
	secret: 'C0d1ng 1s fun 1f y0u kn0w h0w', // set this to a long random string!
	duration: 30 * 60 * 1000,
	activeDuration: 5 * 60 * 1000,
}));

const http = require('http').Server(app);
const io = require('socket.io')(http);


function dbConnect() {

	return new Promise((resolve, reject) => {
		// Connection URL
		var url = 'mongodb://localhost:27017/instaDb';
		// Use connect method to connect to the Server
		mongodb.MongoClient.connect(url, function (err, db) {
			if (err) {
				cl('Cannot connect to DB', err)
				reject(err);
			}
			else {
				//cl("Connected to DB");
				resolve(db);
			}
		});
	});
}

// GETs a list
app.get('/data/:objType', function (req, res) {
	const objType = req.params.objType;
	dbConnect().then(db => {
		const collection = db.collection(objType);

		collection.find({}).toArray((err, objs) => {
			if (err) {
				cl('Cannot get you a list of ', err)
				res.json(404, { error: 'not found' })
			} else {
				cl("Returning list of " + objs.length + " " + objType + "s");
				res.json(objs);
			}
			db.close();
		});
	});
});


app.get('/userStories/:id', function (req, res) {
	const objId = req.params.id;
	console.log({objId})
	cl(`Getting you an Stories with id: ${objId}`);
	dbConnect()
		.then((db) => {
			const collection = db.collection('story');
			collection.find({userId: objId }).toArray((err, posts) => {
				if (posts) {
					cl("this is,posts",posts)
					res.json(posts);
					db.close();
				} else {
					cl('no posts');
					res.json(403, { error: 'Login failed' })
				}

			})
		});

});

// GETs a single
app.get('/data/:objType/:id', function (req, res) {
	const objType = req.params.objType;
	const objId = req.params.id;
	cl(`Getting you an ${objType} with id: ${objId}`);
	dbConnect()
		.then((db) => {
			const collection = db.collection(objType);
			let _id;
			try {
				_id = new mongodb.ObjectID(objId);
			}
			catch (e) {
				return Promise.reject(e);
			}
			return collection.findOne({ _id: _id })
				.then((obj) => {
					cl("Returning a single" + objType);
					res.json(obj);
					db.close();
				})
				.catch(err => {
					cl('Cannot get you that ', err)
					res.json(404, { error: 'not found' })
					db.close();
				})

		});
});


// DELETE
app.delete('/data/:objType/:id', function (req, res) {
	const objType = req.params.objType;
	const objId = req.params.id;
	cl(`Requested to DELETE the ${objType} with id: ${objId}`);
	dbConnect().then((db) => {
		const collection = db.collection(objType);
		collection.deleteOne({ _id: new mongodb.ObjectID(objId) }, (err, result) => {
			if (err) {
				cl('Cannot Delete', err)
				res.json(500, { error: 'Delete failed' })
			} else {
				cl("Deleted", result);
				res.json({});
			}
			db.close();
		});

	});


});
app.post('/data/:userId/liked/:carId', function (req, res) {
	const userId = new mongodb.ObjectID(req.params.userId);
	const carId = new mongodb.ObjectID(req.params.carId);

	dbConnect().then((db) => {
		db.collection('user').findOne({ _id: userId }, (err, user) => {
			if (!user.likedCarIds) user.likedCarIds = [];
			// TODO: support toggle by checking if car already exist
			var isLikedIndex = user.likedCarIds.findIndex(currCarId => currCarId.equals(carId))
			console.log("isLikedIndex", isLikedIndex);
			if (isLikedIndex === -1) {
				user.likedCarIds.push(carId);
			} else {
				user.likedCarIds = user.likedCarIds.splice(isLikedIndex, 1);
			}

			db.collection('user').updateOne({ _id: userId }, user, (err, data) => {
				if (err) {
					cl(`Couldnt ADD LIKE`, err)
					res.json(500, { error: 'Failed to add' })
				} else {
					cl("Like updated");
					res.end()
				}
				db.close();
			})
		})
	});
});

// POST - adds 
app.post('/data/:objType', upload.single('file'), function (req, res) {
	//console.log('req.file', req.file);
	// console.log('req.body', req.body);

	const objType = req.params.objType;
	cl("POST for " + objType);

	const obj = req.body;
	delete obj._id;
	// If there is a file upload, add the url to the obj
	if (req.file) {
		obj.imgUrl = serverRoot + req.file.filename;
	}

	dbConnect().then((db) => {
		const collection = db.collection(objType);

		collection.insert(obj, (err, result) => {
			if (err) {
				cl(`Couldnt insert a new ${objType}`, err)
				res.json(500, { error: 'Failed to add' })
			} else {
				cl(objType + " added");
				res.json(obj);
			}
			db.close();
		});
	});

});

// PUT - updates
app.put('/data/:objType/:id', function (req, res) {
	const objType = req.params.objType;
	const objId = req.params.id;
	const newObj = req.body;
	if (newObj._id && typeof newObj._id === 'string') newObj._id = new mongodb.ObjectID(newObj._id);

	cl(`Requested to UPDATE the ${objType} with id: ${objId}`);
	dbConnect().then((db) => {
		const collection = db.collection(objType);
		collection.updateOne({ _id: new mongodb.ObjectID(objId) }, newObj,
			(err, result) => {
				if (err) {
					cl('Cannot Update', err)
					res.json(500, { error: 'Update failed' })
				} else {
					res.json(newObj);
				}
				db.close();
			});
	});
});

// Basic Login/Logout/Protected assets
app.post('/login', function (req, res) {
	console.log(req.body)
	dbConnect().then((db) => {
		db.collection('user').findOne({ username: req.body.username, pass: req.body.pass }, function (err, user) {
			if (user) {
				cl('Login Succesful');
				delete user.pass;
				req.session.user = user;
				res.json({ token: '', user });
			} else {
				cl('Login NOT Succesful');
				req.session.user = null;
				res.json(403, { error: 'Login failed' })
			}
		});
	});
});

app.get('/logout', function (req, res) {
	req.session.reset();
	res.end('Loggedout');
});

function requireLogin(req, res, next) {
	if (!req.session.user) {
		cl('Login Required');
		res.json(403, { error: 'Please Login' })
	} else {
		next();
	}
}

app.get('/protected', requireLogin, function (req, res) {
	res.end('User is loggedin, return some data');
});


// Kickup our server 
// Note: app.listen will not work with cors and the socket
// app.listen(3003, function () {
http.listen(3003, function () {
	console.log(`misterREST server is ready at ${baseUrl}`);
	console.log(`GET (list): \t\t ${baseUrl}/{entity}`);
	console.log(`GET (single): \t\t ${baseUrl}/{entity}/{id}`);
	console.log(`DELETE: \t\t ${baseUrl}/{entity}/{id}`);
	console.log(`PUT (update): \t\t ${baseUrl}/{entity}/{id}`);
	console.log(`POST (add): \t\t ${baseUrl}/{entity}`);

});


// Some small time utility functions




// function cl(...params) {
// 	console.log.apply(console, params);
// }

// Just for basic testing the socket
// app.get('/', function(req, res){
//   res.sendFile(__dirname + '/test-socket.html');
// });




//OUR CODE@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@



// app.post('/signup', function (req, res) {
// 	console.log(req.body)
// 	dbConnect().then((db) => {
// 		db.collection('user').insertOne(req.body, function (err, res) {
// 			if (!err) {
// 				cl('signup succesful');

// 			} else {
// 				cl('Signup NOT Succesful');
// 				res.json(403, { error: 'Signup failed' })
// 			}
// 			db.close();
// 		});
// 	});
// });

function ListenToPostDb(url, collection) {
	// GETs a list
	app.get('/getStoy/:userId', function (req, res) {
		const user = req.params.userId;
		dbConnect().then(db => {
			const collection = db.collection(story);

			collection.find({ userId: user }).toArray((err, objs) => {
				if (err) {
					cl('Cannot get you a list of ', err)
					res.json(404, { error: 'not found' })
				} else {
					cl("Returning list of " + objs.length + " " + userId + "s");
					res.json(objs);
				}
				db.close();
			});
		});
	});
}
function ListenToPostDb(url, collection) {
	app.post(url, function (req, res) {
		
		dbConnect().then(function (db) {
			db.collection(collection).insertOne(req.body, function (err, res) {
				if (!err) {
					cl(url + ' succesful');

				} else {
					cl(url + ' NOT Succesful');
					res.json(403, { error: url + 'failed' })
				}
				db.close();
			});
		});
	});
}
ListenToPostDb('/signup', 'user')
ListenToPostDb('/addStory', 'story')



io.on('connection', function (socket) {

	console.log('a user connected');
	socket.on('disconnect', function () {
		console.log('user disconnected');
	});

	socket.on('sendComment', function (commentInfo) {
		console.log('SEND COMMENT HAPPEND: ', commentInfo)
		dbConnect().then(db => {
			var newComment = {
				username: commentInfo.username,
				createdAt: Date.now(),
				text: commentInfo.text,
				userId: commentInfo.userId
			}
			commentInfo.storyId = new mongodb.ObjectID(commentInfo.storyId)
			var collection = db.collection('story')
			collection.update(
				{ _id: commentInfo.storyId },
				{ $push: { comments: newComment } }
			)
			collection.findOne({ _id: commentInfo.storyId }, (err,story) => {
				console.log('sending story: ',story)
				io.emit('postUpdate', story);
				db.close();
			})
		})
	})
	socket.on('sendLike', function (likeInfo) {
		dbConnect().then(db => {
			likeInfo.storyId = new mongodb.ObjectID(likeInfo.storyId)
			var collection = db.collection('story')
			collection.findOne({ _id: likeInfo.storyId })
				.then(story => {
					var isLiked = story.likes.findIndex((likeUserId) => {
						return likeUserId === likeInfo.userId
					})
					if (isLiked === -1) {
						db.collection('story').update(
							{ _id: likeInfo.storyId },
							{ $push: { likes: likeInfo.userId } }
						)
						console.log('send like event : ', likeInfo)
					}
					else console.log('like verification false')
					db.close();
				})
		});
	})
	// socket.on('clientSendStory', (story) => {
	// 	dbConnect().then(function (db) {
	// 		db.collection(collection).insertOne('story', function (err, res) {
	// 			if (!err) {
	// 				cl(url + ' succesful');

	// 			} else {
	// 				cl(url + ' NOT Succesful');
	// 				io.emit('servSendStory',story)
	// 			}
	// 			db.close();
	// });


	socket.on('feedReq', (userId) => {
		// console.log('req feed happend', userId)
		var query = {};

		dbConnect().then((db) => {

			db.collection('story').find(query).toArray((err, objs) => {
				if (err) {
					cl('Cannot get you a list of ', err)
					// res.json(404, { error: 'not found' })
				} else {
					cl("Returning list of " + objs.length + " stories");
					// res.json(objs);
					io.emit('feedSend', objs);

				}
				db.close();
			});
		})
	})

	// userId = new mongodb.ObjectID(userId)
	// db.collection('user').findOne({ _id: userId })
	// 	.then((user) => {
	// console.log('user from req feed', user)
	// var followingIds = user.followingIds
	// console.log('@@@@@@@@@ following ids: ', followingIds)
	// var following = db.collection('story').find({
	// 	userId: { "$in": followingIds }
	// })
	// io.emit('send feed', tempFeed);
	// })
	// .catch(err => console.log('couldnt find userID error: ',err))
	// db.close();
})
// 	})
// })



cl('WebSocket is Ready');


const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { distance, round } = require('mathjs');
const path = require('path');
const cors = require('cors'); // Import CORS
const fs = require('fs');
const { spawn } = require('child_process');


const app = express();
const server = http.createServer(app);

app.use(express.json());

let clientCoordinates = {};
let puckCoordinates = {};
let radius = 150;
let center = { x: 250, y: 250};
let poiCoords = null;
let userCount = 0;

let readyUsers = 0;
let leaderboard = [];


let jsonFilePath = path.join(__dirname, 'data/new_bucket.jsonl');

const corsOptions = {
  origin: '*', // Allow requests from any origin
  methods: ['GET', 'POST'], 
  credentials: true,
};

app.use(cors(corsOptions));

const io = new Server(server, {
  cors: {
    origin: '*', // Allow requests from any origin
    methods: ['GET', 'POST'],
    credentials: true,
  },
});


io.on('connection', (socket) => {
  console.log('A user has joined:', socket.id);
  clientCoordinates[socket.id] = { x: 0, y: 0 };

  // Add poi from the frontend
  socket.on('add-poi', (formData, callback) => {
    const { title, one_liner, description } = formData;

    let existingPOIs = [];

    // Check if the file exists and is not empty
    if (fs.existsSync(jsonFilePath) && fs.statSync(jsonFilePath).size > 0) {
      const fileData = fs.readFileSync(jsonFilePath, 'utf-8').trim().split('\n');
      existingPOIs = fileData.map(line => JSON.parse(line));
    }

    // Generate a new unique id for the POI
    const newId = existingPOIs.length ? Math.max(...existingPOIs.map(poi => parseInt(poi.id))) + 1 : 1;

    // Create the new POI object
    const newPOI = {
      id: newId.toString(),
      title,
      one_liner,
      description,
      mu: 25,       // Default value
      sigma: 8.333, // Default value
      swarm_score: 0 // Initial swarm score
    };

    // Append the new POI object to the file
    fs.appendFileSync(jsonFilePath, JSON.stringify(newPOI) + '\n');

    // Send a response back to the client using the callback function
    callback({ message: 'POI added successfully', newPOI });
  });

  socket.on('user-ready', () => {
    // if (readyUsers >= userCount){
    //   readyUsers = 0;
    // }

    readyUsers++;
    console.log('User is ready : ', readyUsers);
    if (readyUsers >= userCount){
      console.log('GOTOSWARM!!!')
      readyUsers = 0;
      userCount = 0;
      console.log('UserCount after reset : ', userCount);
      console.log('ReadyUsers after reset  : ', readyUsers);
      io.emit('go-to-swarm');
    } else {
      io.emit('update-user-ready-client', readyUsers);
    }
  });

  socket.on('user-not-ready', () => {
    readyUsers--;
    console.log('User is not ready : ', readyUsers);
    io.emit('update-user-ready-client', readyUsers);
  });


  // Handle when a user joins the waiting room
  socket.on('join-waiting-room', () => {
    userCount++; // Increment user count
    io.emit('update-user-count', Math.max(userCount, 0)); // Emit the updated user count to all clients
    
    console.log(`Join-waiting room event: ${userCount}`);

    // If enough users have joined, start the swarm
    if (userCount >= 1) {
      //Draw 5 poi's from data/new_data.jsonl with using python script
      const N_new = 4;
      const N_old = 0;

      const pythonProcess = spawn('python', [
        path.join(__dirname, 'pythonscripts/drawing.py'),
        N_new.toString(),
        N_new.toString()
      ]);

      pythonProcess.stdout.on('data', (result) => {
        // The result from the Python script comes in as a buffer, so we need to convert it to a string
        const poiData = JSON.parse(result.toString());
        let drawnIds = poiData[0];
        let drawnTitles = poiData[1];
        let drawnOneliners = poiData[2];
        let drawnDescriptions = poiData[3];


        const payload = {
          drawnTitles: drawnTitles,
          drawnIds: drawnIds,
          drawnOneliners: drawnOneliners,
          drawnDescriptions: drawnDescriptions,
          userCount: userCount
        }
        io.emit('start-swarming', payload); // Emit an event to all users to start the swarm
      }); 
      
      pythonProcess.stderr.on('data', (error) => {
        console.error(`Error in drawing: ${error.toString()}`);
      });

      pythonProcess.on('close', (code) => {
        console.log(`Python drawing process exited with code ${code}`);
      });

    }
  });

  socket.on('mouse-move', (data) => {
    clientCoordinates[socket.id] = { x: data.cursorPosition.x, y: data.cursorPosition.y };
    puckCoordinates = data.puckPosition;

    const midpoint = [center.x, center.y];
    const radius_tmp = radius;
    const puckPositionList = [puckCoordinates.x, puckCoordinates.y];
    const coordinatesList = Object.values(clientCoordinates).map(coord => [coord.x, coord.y]);
    const num_players = coordinatesList.length;

    const pythonProcess = spawn('python', [
      path.join(__dirname, 'pythonscripts/swarming_algorithm.py'),
      JSON.stringify(midpoint),
      radius_tmp.toString(),
      JSON.stringify(puckPositionList),
      JSON.stringify(coordinatesList),
      num_players.toString()
    ]);

    let dataBuffer = '';
    
    pythonProcess.stdout.on('data', (chunk) => {
      dataBuffer += chunk;
    });

    pythonProcess.stdout.on('data', (result) => {
      // The result from the Python script comes in as a buffer, so we need to convert it to a string
      const calculatedPuckPosition = JSON.parse(result.toString());
      // console.log('Calculated puck position:', calculatedPuckPosition);

      // Broadcast the new puck position to all clients
      puckCoordinates.x = calculatedPuckPosition[0];
      puckCoordinates.y = calculatedPuckPosition[1];

      if (poiCoords !== null) {
        for (const poi of poiCoords) {
          const distanceToOption = distance(
            { pointOneX: puckCoordinates.x, pointOneY: puckCoordinates.y },
            { pointTwoX: poi.x, pointTwoY: poi.y }
          );

          if (distanceToOption < 18) {
            io.emit('puck-collision', poi.name);
            puckCoordinates.x = center.x;
            puckCoordinates.y = center.y;
          }
        }
      }

      io.emit('puck-move', puckCoordinates);
      io.emit('client-coordinates', clientCoordinates);
    });

    pythonProcess.stderr.on('data', (error) => {
      console.error(`Error: ${error.toString()}`);
    });

    pythonProcess.on('close', (code) => {
      console.log(`Python swarming process exited with code ${code}`);
    });

    // calculatePuckPosition();
  });

  socket.on('connection-data', (data) => {
    radius = data.radius;
    center = data.centre;
  });

  socket.on('puck-coordinates-data', (data) => {
    poiCoords = data.poiCoords;
  });

  socket.on('swarming-result-ids', (data)=> {
    console.log('Getting IDs from swarmresults.vue')
    console.log(data);

    const pythonProcess = spawn('python', [
      path.join(__dirname, 'pythonscripts/rating.py'),
      JSON.stringify(data)
    ]);

    pythonProcess.stdout.on('data', (result) => {
      // The result from the Python script comes in as a buffer, so we need to convert it to a string
      let pythonCode = JSON.parse(result.toString());
      console.log('Python process of rating exited with code', pythonCode);
    });
  });

  socket.on('get-leaderboard', () => {
    console.log('Getting leaderboard');
    const N = 10;

    const pythonProcess = spawn('python', [
      path.join(__dirname, 'pythonscripts/leaderboard.py'),
      N.toString()
    ]);

    pythonProcess.stdout.on('data', (result) => {
      // The result from the Python script comes in as a buffer, so we need to convert it to a string
      leaderboard = JSON.parse(result.toString());
      console.log('Leaderboard:', leaderboard);
      io.emit('leaderboard', leaderboard);
    });

    pythonProcess.stderr.on('data', (error) => {
      console.error(`Error: ${error.toString()}`);
    });

    pythonProcess.on('close', (code) => {
      console.log(`Python leaderboard process exited with code ${code}`);
    });
  }); 

  
  // Decrement user count only when the user cancels the popup (leaves waiting room)
  socket.on('leave-waiting-room', () => {
    userCount = Math.max(userCount - 1, 0); // Decrement the user count, clipping it to 0
    io.emit('update-user-count', userCount);
  });

  socket.on('disconnect', () => {
    delete clientCoordinates[socket.id];
    console.log('A user disconnected:', socket.id);
  });
});

// // Checks whether the client coordinates are being correctly printed, only for debugging, doesnt contribute to the logic
// setInterval(() => {
//   // console.log('Client Coordinates:', clientCoordinates);
//   // console.log('Puck Coordinates:', puckCoordinates);
//   // console.log(radius);
//   // console.log(center);
// }, 1000);

// For all other routes, log a message
app.get('*', (req, res) => {
  console.log('Hello from the server!'); // Log the message
  res.sendStatus(200); // Respond with a 200 OK status
});

// Start the server on port 4000
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});

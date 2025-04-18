const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { distance } = require('mathjs');
const path = require('path');
const cors = require('cors'); // Import CORS
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
app.use(express.json());

// heroku
let SWARM_SIZE = 1;

let clientCoordinates = {};
let puckCoordinates = {};
let radius = null;
let center = {};
// let poiCoords = null;
let poiCoords = {};
let userCount = 0;
let updateRatings = true;
let waitingList = [];

let readyUsers = 0;
let leaderboard = [];

let jsonFilePath = path.join(__dirname, 'data/new_bucket.jsonl');

// clientCoordinates['tutorial'] = {};
// clientCoordinates['tutorial']['user1'] = { x: 357.21525750954606, y: 470.29500347752264 }; 
// clientCoordinates['tutorial']['user2'] = { x: 469.2982250920686, y: 359.23959205099777 };
// clientCoordinates['tutorial']['user3'] = { x: 426.2474859757392, y: 420.1817372317946 };

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

function generateRandomRoomName(length=5) {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// const roomUserCounts = {
//   room1: 0,
//   room2: 0,
//   room3: 0
// };

const roomUserCounts = {};
const readyUserCounts = {};

io.on('connection', (socket) => {
  console.log('A user has joined:', socket.id);
  // clientCoordinates[socket.id] = { x: 250, y: 250 };

  // Add poi from the frontend
  socket.on('add-pois', (formData, callback) => {
    console.log('printing from server');
    console.log(`Form data: ${formData}`);

    let existingPOIs = [];
  
    // Check if the file exists and is not empty
    if (fs.existsSync(jsonFilePath) && fs.statSync(jsonFilePath).size > 0) {
      const fileData = fs.readFileSync(jsonFilePath, 'utf-8').trim().split('\n');
      existingPOIs = fileData.map(line => JSON.parse(line));
    }
    formData.forEach((formData) => {
      const { title, one_liner, description } = formData;
  
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

      console.log(`New POI: ${JSON.stringify(newPOI)}`);
  
      // Append the new POI object to the file
      fs.appendFileSync(jsonFilePath, JSON.stringify(newPOI) + '\n');
  
      // Add the new POI to the existing POIs list
      existingPOIs.push(newPOI);
    });
  
    // Send a response back to the client using the callback function
    callback({ status: "ok" });
  });

  socket.on('user-ready', (room) => {
    readyUserCounts[room]++;
    io.to(room).emit('update-user-ready-client', readyUserCounts[room]);
    
    if (readyUserCounts[room] >= roomUserCounts[room]) {
      io.to(room).emit('go-to-swarm');
      delete readyUserCounts[room];
      delete roomUserCounts[room];
      puckCoordinates[room] = { x: 250, y: 250};
    }
  });

  socket.on('user-not-ready', (room) => {
    readyUserCounts[room] = Math.max(readyUserCounts[room] - 1, 0);
    io.to(room).emit('update-user-ready-client', readyUserCounts[room]);
  });

  socket.on('admin-joining', () => {
    readyUsers++;
    console.log('Admin is ready : ', readyUsers);
  })

  socket.on('reset-counts', (room) => {
    readyUsers--;
    // userCount--;
    console.log("PRINTING JUST BEFORE GOING TO SWARM: ", waitingList.length);
    delete roomUserCounts[room];
    delete readyUserCounts[room];
  });
  
  socket.on('delete-all-pois', () => {
    console.log('Deleting all POIs');
    fs.writeFileSync(path.join(__dirname, 'data', 'new_bucket.jsonl'), '', 'utf-8'); 
    fs.writeFileSync(path.join(__dirname, 'data', 'old_bucket.jsonl'), '', 'utf-8'); 
    console.log('All POIs deleted');
    // io.emit('pois-deleted', { status: 'ok' });
  });

  socket.on('change-swarm-size', (newSize) => {
    console.log('Changing swarm size to:', newSize);
    SWARM_SIZE = newSize;
  });


  socket.on('join-random-swarm', () => {

    // userCount++;
    waitingList.push(socket.id);
    io.emit('update-user-ready-client', waitingList.length);
    console.log(`User count: ${waitingList.length}`);
    
    
    if (waitingList.length >= SWARM_SIZE) {
      const N_new = 4;
      const N_old = 0;



      const pythonProcess = spawn('python3', [
        'pythonscripts/drawing.py',
        N_new.toString(),
        N_old.toString()
      ]);

      pythonProcess.stdout.on('data', (result) => {
        // The result from the Python script comes in as a buffer, so we need to convert it to a string
        const poiData = JSON.parse(result.toString());
        let drawnIds = poiData[0];
        let drawnTitles = poiData[1];
        let drawnOneliners = poiData[2];
        let drawnDescriptions = poiData[3];

        console.log('poiData:', poiData);
        
        const room = `room${generateRandomRoomName()}`;
        clientCoordinates[room] = {};
        
        const payload = {
          drawnTitles: drawnTitles,
          drawnIds: drawnIds,
          drawnOneliners: drawnOneliners,
          drawnDescriptions: drawnDescriptions,
          userCount: waitingList.length
        }
        
        for (let i = 0; i < SWARM_SIZE; i++) {

          const user = waitingList.shift();
          clientCoordinates[room][socket.id] = { x: 250, y: 250 };  
          io.sockets.sockets.get(user).join(room);
        }
        
        roomUserCounts[room] = SWARM_SIZE;
        readyUserCounts[room] = 0;
        io.to(room).emit('update-room-user-count', { room: room, count: roomUserCounts[room] });
        // console.log(`${SWARM_SIZE} users being redirected to random room`)
        // readyUsers = readyUsers - SWARM_SIZE;
        io.emit('update-user-ready-client', waitingList.length);
        io.to(room).emit('start-swarming', payload); // Emit an event to users in the room to start the swarm
      }); 
      
      pythonProcess.stderr.on('data', (error) => {
        console.error(`Error in drawing: ${error.toString()}`);
      });

      // pythonProcess.on('close', (code) => {
      //   console.log(`Python drawing process exited with code ${code}`);
      // });

    }
  });


  socket.on('tutorial-3-mouse-move', (data) => {
    // clientCoordinates[socket.id] = { x: data.cursorPosition.x, y: data.cursorPosition.y };
    // console.log('Tutorial Room:', data.room);
    // console.log("data: ", data);
    if (!clientCoordinates[data.room]) {
      clientCoordinates[data.room] = {};
    }

    // console.log(data.cursorPosition);
    // clientCoordinates[data.room]['user1'] = { x: 57.78992384367197, y: 401.9219754478547 };
    clientCoordinates[data.room]['user1'] = { x: 13.579288492444732, y: 185.73300092379196 };
    clientCoordinates[data.room]['user2'] = { x: 18.843373808451304, y: 331.1887564120834 };
    clientCoordinates[data.room]['user3'] = { x: 8.320257503716732, y: 290.19828437794604 };
    // console.log('clientCoordinates:', clientCoordinates);
    clientCoordinates[data.room][socket.id] = { x: data.cursorPosition.x, y: data.cursorPosition.y };
    // puckCoordinates = data.puckPosition;
    puckCoordinates[data.room] = data.puckPosition;
    // console.log('Puck coordinates:', puckCoordinates);

    const midpoint = [center.x, center.y];
    const radius_tmp = radius;
    const puckPositionList = [puckCoordinates[data.room].x, puckCoordinates[data.room].y];
    // const coordinatesList = Object.values(clientCoordinates).map(coord => [coord.x, coord.y]);
    const coordinatesList = Object.values(clientCoordinates[data.room]).map(coord => [coord.x, coord.y]);
    const num_players = coordinatesList.length;
  
    try {
      const calculatedPuckPosition = updatePosition(midpoint, radius_tmp, puckPositionList, coordinatesList, num_players);
  
      // Broadcast the new puck position to all clients
      puckCoordinates[data.room].x = calculatedPuckPosition[0];
      puckCoordinates[data.room].y = calculatedPuckPosition[1];
      if (poiCoords[data.room] !== null) {
        for (const poi of poiCoords[data.room]) {
          const distanceToOption = distance(
            { pointOneX: puckCoordinates[data.room].x, pointOneY: puckCoordinates[data.room].y },
            { pointTwoX: poi.x, pointTwoY: poi.y }
          );
  
          if (distanceToOption < 18) {
            io.emit('puck-collision', {poiName: poi.name, room: data.room});
            puckCoordinates[data.room].x = center.x;
            puckCoordinates[data.room].y = center.y;
            io.emit('puck-move', puckCoordinates);
          }
        }
      }
  
      io.emit('puck-move', puckCoordinates);
      io.emit('client-coordinates', clientCoordinates);
    } catch (error) {
      console.error(`Error in updatePosition: ${error.message}`);
    }
  });


  socket.on('tutorial-mouse-move', (data) => {
    // clientCoordinates[socket.id] = { x: data.cursorPosition.x, y: data.cursorPosition.y };
    // console.log('Tutorial Room:', data.room);
    // console.log("data: ", data);
    if (!clientCoordinates[data.room]) {
      clientCoordinates[data.room] = {};
    }

    // console.log(data.cursorPosition);
    clientCoordinates[data.room]['user1'] = { x: 357.21525750954606, y: 470.29500347752264 }; 
    clientCoordinates[data.room]['user2'] = { x: 469.2982250920686, y: 359.23959205099777 };
    clientCoordinates[data.room]['user3'] = { x: 426.2474859757392, y: 420.1817372317946 };
    clientCoordinates[data.room][socket.id] = { x: data.cursorPosition.x, y: data.cursorPosition.y };
    // puckCoordinates = data.puckPosition;
    puckCoordinates[data.room] = data.puckPosition;
    // console.log('Puck coordinates:', puckCoordinates);

    const midpoint = [center.x, center.y];
    const radius_tmp = radius;
    const puckPositionList = [puckCoordinates[data.room].x, puckCoordinates[data.room].y];
    // const coordinatesList = Object.values(clientCoordinates).map(coord => [coord.x, coord.y]);
    const coordinatesList = Object.values(clientCoordinates[data.room]).map(coord => [coord.x, coord.y]);
    const num_players = coordinatesList.length;
  
    try {
      const calculatedPuckPosition = updatePosition(midpoint, radius_tmp, puckPositionList, coordinatesList, num_players);
  
      // Broadcast the new puck position to all clients
      puckCoordinates[data.room].x = calculatedPuckPosition[0];
      puckCoordinates[data.room].y = calculatedPuckPosition[1];
      if (poiCoords[data.room] !== null) {
        for (const poi of poiCoords[data.room]) {
          const distanceToOption = distance(
            { pointOneX: puckCoordinates[data.room].x, pointOneY: puckCoordinates[data.room].y },
            { pointTwoX: poi.x, pointTwoY: poi.y }
          );
  
          if (distanceToOption < 18) {
            io.emit('puck-collision', {poiName: poi.name, room: data.room});
            puckCoordinates[data.room].x = center.x;
            puckCoordinates[data.room].y = center.y;
            io.emit('puck-move', puckCoordinates);
          }
        }
      }
  
      io.emit('puck-move', puckCoordinates);
      io.emit('client-coordinates', clientCoordinates);
    } catch (error) {
      console.error(`Error in updatePosition: ${error.message}`);
    }
  });


  socket.on('mouse-move', (data) => {
    if (!clientCoordinates[data.room]) {
      clientCoordinates[data.room] = {};
    }
    clientCoordinates[data.room][socket.id] = { x: data.cursorPosition.x, y: data.cursorPosition.y };
    // console.log('Cursor position: ', data.cursorPosition);
    // puckCoordinates = data.puckPosition;
    puckCoordinates[data.room] = data.puckPosition;
    // console.log('Puck coordinates:', puckCoordinates);

    const midpoint = [center.x, center.y];
    const radius_tmp = radius;
    const puckPositionList = [puckCoordinates[data.room].x, puckCoordinates[data.room].y];
    // const coordinatesList = Object.values(clientCoordinates).map(coord => [coord.x, coord.y]);
    const coordinatesList = Object.values(clientCoordinates[data.room]).map(coord => [coord.x, coord.y]);
    const num_players = coordinatesList.length;
  
    try {
      const calculatedPuckPosition = updatePosition(midpoint, radius_tmp, puckPositionList, coordinatesList, num_players);
  
      // Broadcast the new puck position to all clients
      puckCoordinates[data.room].x = calculatedPuckPosition[0];
      puckCoordinates[data.room].y = calculatedPuckPosition[1];
      if (poiCoords[data.room] !== null) {
        for (const poi of poiCoords[data.room]) {
          const distanceToOption = distance(
            { pointOneX: puckCoordinates[data.room].x, pointOneY: puckCoordinates[data.room].y },
            { pointTwoX: poi.x, pointTwoY: poi.y }
          );
  
          if (distanceToOption < 18) {
            io.emit('puck-collision', {poiName: poi.name, room: data.room});
            puckCoordinates[data.room].x = center.x;
            puckCoordinates[data.room].y = center.y;
            io.emit('puck-move', puckCoordinates);
          }
        }
      }
  
      io.emit('puck-move', puckCoordinates);
      io.emit('client-coordinates', clientCoordinates);
    } catch (error) {
      console.error(`Error in updatePosition: ${error.message}`);
    }
  });

  socket.on('connection-data', (data) => {
    radius = data.radius;
    center = data.centre;
  });

  socket.on('puck-coordinates-data', (data) => {
    poiCoords[data.room] = data.poiCoords;
  });

  socket.on('get-new-bucket', () => {
    const filePath = path.join(__dirname, 'data', 'new_bucket.jsonl');
    // Read the file
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            socket.emit('error', 'Failed to load bucket data');
            return;
        }

        // Each line in the jsonl file is a separate JSON object
        const lines = data.split('\n').filter(Boolean);  // Split by line, filter out any empty lines
        const jsonData = lines.map(line => JSON.parse(line));  // Convert each line to a JSON object

        // Emit the parsed data back to the client
        socket.emit('new-bucket-data', jsonData);
    });
  });

  socket.on('swarming-result-ids', (data)=> {
    console.log('Getting swarmingresultids from the frontend', data.swarmIds);
    
    // Delete client coordinates
    if (clientCoordinates[data.room]){
      delete clientCoordinates[data.room];
    }

    if(puckCoordinates[data.room]){
      delete puckCoordinates[data.room];
    }

    if (updateRatings){
      console.log('Updating ratings');
      updateRatings = false;
      const pythonProcess = spawn('python3', [
        'pythonscripts/rating.py',
        JSON.stringify(data.swarmIds)
      ]);
    
  
      pythonProcess.stdout.on('data', (result) => {
        // The result from the Python script comes in as a buffer, so we need to convert it to a string
        let pythonCode = JSON.parse(result.toString());
        console.log('Python process of rating exited with code', pythonCode);
      });

    }
  });

  socket.on('tutorial-swarming-result-ids', (data)=> {
    console.log('Getting swarmingresultids from the frontend', data.swarmIds);
    
    // Delete client coordinates
    if (clientCoordinates[data.room]){
      delete clientCoordinates[data.room];
    }

    if(puckCoordinates[data.room]){
      delete puckCoordinates[data.room];
    }
  });

  socket.on('get-leaderboard', () => {
    console.log('Getting leaderboard');
    const N = 10;

    // const pythonProcess = spawn('python3', [
    //   'pythonscripts/leaderboard.py',
    //   N.toString()
    // ]);
    const pythonProcess = spawn('python3', [
      'pythonscripts/leaderboard.py'
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

  socket.on('disconnect', (reason) => {
    // console.log('printing client disconnecting from the server side');
    console.log('Reason for disconnect:', reason);


    for (const room in clientCoordinates) {
      if (clientCoordinates[room][socket.id]) {
        delete clientCoordinates[room][socket.id];
        break;
      }
    }

    // DELETING THE CLIENT COORDINATES OF THE DISCONNECTED SOCKET
    // delete clientCoordinates[socket.id];

    waitingList = waitingList.filter(id => id !== socket.id);
    if (reason === 'transport close') {
      console.log('TRANSPORT CLOSE');
      // userCount = Math.max(userCount-1, 0);
    }
    console.log('A user disconnected:', socket.id);
    console.log('User count after disconnect:', waitingList.length);
    io.emit('update-user-ready-client', waitingList.length);
  });
});

function normalizeArray(arr) {
  const norm = Math.sqrt(arr.reduce((acc, val) => acc + val * val, 0));
  if (norm === 0) return arr;
  return arr.map(val => val / norm);
}

function updatePosition(midpointPos, radius, puckPos, cursorPos, numPlayers) {
  try {
    // Finds the relative position of each cursor compared to the puck.
    // If a cursor is to the right of the puck, its x influence will be positive.
    // If a cursor is above the puck, its y influence will be positive.
    const relativeCursorPos = cursorPos.map(pos => pos.map((val, idx) => val - puckPos[idx]));

    // Converts the cursor vectors into unit vectors (only showing direction, not magnitude).
    // This ensures all inputs contribute equally, regardless of distance.
    const normalizedCursorPos = relativeCursorPos.map(pos => normalizeArray(pos));

    // Summing all cursor vectors → determines where the puck should move.
    // Divides by numPlayers → ensures equal influence from all players.
    // Normalizes again → ensures movement is based on direction rather than raw sum.
    const direction = normalizedCursorPos.reduce((acc, pos) => acc.map((val, idx) => val + pos[idx]), [0, 0]);
    const strength = Math.sqrt(direction.reduce((acc, val) => acc + val * val, 0)) / numPlayers;
    const normalizedDirection = normalizeArray(direction);

    // Calculate the timestep based on the distance and the speed of the puck
    // Essentially a speed factor
    const timestep = 3 / (100e-3);
    const stepsize = radius / timestep; // distance per timestep

    // Calculate the new position of the puck
    let newPuckPosition = puckPos.map((val, idx) => val + stepsize * normalizedDirection[idx] * strength);

    // Check if the new puck position is outside the circle, if so, set it to the edge of the circle
    // Makes sure the puck stays within the circle
    const distanceFromMidpoint = Math.sqrt(newPuckPosition.reduce((acc, val, idx) => acc + Math.pow(val - midpointPos[idx], 2), 0));
    if (distanceFromMidpoint > radius) {
      const positionVec = newPuckPosition.map((val, idx) => val - midpointPos[idx]);
      const unitVec = normalizeArray(positionVec);
      newPuckPosition = midpointPos.map((val, idx) => val + unitVec[idx] * radius);
    }

    newPuckPosition = newPuckPosition.map(val => Math.round(val * 1000) / 1000);

    return newPuckPosition;
  } catch (error) {
    throw new Error(`Error in updatePosition: ${error.message}`);
  }
}

// For all other routes, log a message
app.get('*', (req, res) => {
  console.log('Hello from the server!'); // Log the message
  res.sendStatus(200); // Respond with a 200 OK status
});

// Start the server on port 4000
const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on ${PORT}`);
});
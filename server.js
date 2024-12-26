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


const SWARM_SIZE = 2;
let clientCoordinates = {};
let puckCoordinates = {};
let radius = null;
let center = {};
let poiCoords = null;
let userCount = 0;
let updateRatings = true;
let waitingList = [];

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
  clientCoordinates[socket.id] = { x: 250, y: 250 };

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

  // socket.on('user-ready', () => {
  //   readyUsers++;
  //   console.log('User is ready : ', readyUsers);
  //   if (readyUsers >= userCount){
  //     console.log('GOTOSWARM!!!')
  //     readyUsers = 0;
  //     userCount = 0;
  //     updateRatings = true;
  //     console.log('UserCount after reset : ', userCount);
  //     console.log('ReadyUsers after reset  : ', readyUsers);
  //     io.emit('go-to-swarm');
  //   } else {
  //     io.emit('update-user-ready-client', readyUsers);
  //   }
  // });
  
  // socket.on('user-not-ready', () => {
  //   readyUsers--;
  //   console.log('User is not ready : ', readyUsers);
  //   io.emit('update-user-ready-client', readyUsers);
  // });
  socket.on('user-ready', (room) => {
    // console.log('Printing from the room :', room);
    // console.log(readyUserCounts[room])
    // console.log(roomUserCounts[room])
    readyUserCounts[room]++;
    io.to(room).emit('update-user-ready-client', readyUserCounts[room]);
    
    if (readyUserCounts[room] >= roomUserCounts[room]) {
      io.to(room).emit('go-to-swarm');
      // readyUserCounts[room] = 0; // Reset ready user count for the room
      delete readyUserCounts[room];
      delete roomUserCounts[room];
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
    userCount--;
    // roomUserCounts[room] = 0;
    // readyUserCounts[room] = 0;  
  });
  
  socket.on('join-random-swarm', () => {
    // make a list of active rooms
    userCount++;
    io.emit('update-user-ready-client', userCount);
    waitingList.push(socket.id);
    
    if (userCount >= SWARM_SIZE) {
      //Draw 5 poi's from data/new_data.jsonl with using python script
      console.log(`Waiting list: ${waitingList}`);
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
        
        const room = `room${generateRandomRoomName()}`;
        
        const payload = {
          drawnTitles: drawnTitles,
          drawnIds: drawnIds,
          drawnOneliners: drawnOneliners,
          drawnDescriptions: drawnDescriptions,
          userCount: userCount
        }
        // io.emit('start-swarming', payload); // Emit an event to all users to start the swarm
        // const room = `room${Math.floor(Math.random() * 3) + 1}`;
        
        // using a for loop, get the first SWARM_SIZE users from the waiting list and add them to the room
        for (let i = 0; i < SWARM_SIZE; i++) {
          const user = waitingList.shift();
          io.sockets.sockets.get(user).join(room);
        }
        roomUserCounts[room] = SWARM_SIZE;
        readyUserCounts[room] = 0;
        io.to(room).emit('update-room-user-count', { room: room, count: roomUserCounts[room] });
        console.log(`${SWARM_SIZE} users being redirected to random room`)
        readyUsers = readyUsers - SWARM_SIZE;
        io.emit('update-user-ready-client', readyUsers);
        io.to(room).emit('start-swarming', payload); // Emit an event to users in the room to start the swarm

        // const user1 = waitingList.shift();
        // const user2 = waitingList.shift();

        // if (user1 && user2) {
        //   io.sockets.sockets.get(user1).join(room);
        //   io.sockets.sockets.get(user2).join(room);
        //   roomUserCounts[room] = SWARM_SIZE;
        //   readyUserCounts[room] = 0;
        //   io.to(room).emit('update-room-user-count', { room: room, count: roomUserCounts[room] });
        //   console.log(`${SWARM_SIZE} users being redirected to random room`)
        //   readyUsers = readyUsers - SWARM_SIZE;
        //   io.emit('update-user-ready-client', readyUsers);
        //   io.to(room).emit('start-swarming', payload); // Emit an event to users in the room to start the swarm
        // }
      }); 
      
      pythonProcess.stderr.on('data', (error) => {
        console.error(`Error in drawing: ${error.toString()}`);
      });

      pythonProcess.on('close', (code) => {
        console.log(`Python drawing process exited with code ${code}`);
      });

    }
  });

  // Handle when a user joins the waiting room
  socket.on('join-waiting-room', () => {
    userCount++; // Increment user count
    io.emit('update-user-count', Math.max(userCount, 0)); // Emit the updated user count to all clients
    
    console.log(`Join-waiting room event: ${userCount}`);

    // If enough users have joined, start the swarm
    if (userCount >= 4) {
      //Draw 5 poi's from data/new_data.jsonl with using python script
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

        const payload = {
          drawnTitles: drawnTitles,
          drawnIds: drawnIds,
          drawnOneliners: drawnOneliners,
          drawnDescriptions: drawnDescriptions,
          userCount: userCount
        }
        io.emit('start-swarming', payload); // Emit an event to all users to start the swarm
        swarmComments = [];
        swarmRatings = [];
        swarmReceipts = [];
      }); 
      
      pythonProcess.stderr.on('data', (error) => {
        console.error(`Error in drawing: ${error.toString()}`);
      });

      pythonProcess.on('close', (code) => {
        console.log(`Python drawing process exited with code ${code}`);
      });

    }
  });

  socket.on('join-room', (room) => {
    console.log(`User joining ${room}`);
    socket.join(room);
    
    // Increment the user count for the room
    roomUserCounts[room]++;
    
    // Emit the updated user count for the room
    io.to(room).emit('update-room-user-count', { room, count: roomUserCounts[room] });
    
    // Check if the room has 4 users
    if (roomUserCounts[room] === 2) {
      startSwarming(room);
    }
    
    socket.emit('joined-room', room);
  });

  socket.on('leave-room', (room) => {
    console.log(`User leaving ${room}`);
    socket.leave(room);
    
    // Decrement the user count for the room
    roomUserCounts[room] = Math.max(roomUserCounts[room] - 1, 0);
    
    // Emit the updated user count for the room
    io.to(room).emit('update-room-user-count', { room, count: roomUserCounts[room] });
  });

  socket.on('mouse-move', (data) => {
    clientCoordinates[socket.id] = { x: data.cursorPosition.x, y: data.cursorPosition.y };
    puckCoordinates = data.puckPosition;
  
    const midpoint = [center.x, center.y];
    const radius_tmp = radius;
    const puckPositionList = [puckCoordinates.x, puckCoordinates.y];
    const coordinatesList = Object.values(clientCoordinates).map(coord => [coord.x, coord.y]);
    const num_players = coordinatesList.length;
  
    try {
      const calculatedPuckPosition = updatePosition(midpoint, radius_tmp, puckPositionList, coordinatesList, num_players);
  
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
    poiCoords = data.poiCoords;
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
    console.log('Getting swarmingresultids from the frontend', data);
    if (updateRatings){
      console.log('Updating ratings');
      updateRatings = false;
      const pythonProcess = spawn('python3', [
        'pythonscripts/rating.py',
        JSON.stringify(data)
      ]);
  
      pythonProcess.stdout.on('data', (result) => {
        // The result from the Python script comes in as a buffer, so we need to convert it to a string
        let pythonCode = JSON.parse(result.toString());
        console.log('Python process of rating exited with code', pythonCode);
      });

    }
  });

  socket.on('get-leaderboard', () => {
    console.log('Getting leaderboard');
    const N = 10;

    const pythonProcess = spawn('python3', [
      'pythonscripts/leaderboard.py',
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
    console.log('printing client disconnecting from the server side')
    delete clientCoordinates[socket.id];
    waitingList = waitingList.filter(id => id !== socket.id);
    console.log('A user disconnected:', socket.id);
    // console.log('User count after disconnect:', userCount);
    io.emit('update-user-ready-client', userCount);
  });
});

function startSwarming(room) {
  console.log(`Starting swarming in ${room}`);
  
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

    const payload = {
      drawnTitles: drawnTitles,
      drawnIds: drawnIds,
      drawnOneliners: drawnOneliners,
      drawnDescriptions: drawnDescriptions,
      userCount: roomUserCounts[room]
    };
    
    io.to(room).emit('start-swarming', payload); // Emit an event to users in the room to start the swarm
    swarmComments = [];
    swarmRatings = [];
    swarmReceipts = [];
  });

  pythonProcess.stderr.on('data', (error) => {
    console.error(`Error in drawing: ${error.toString()}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`Python drawing process exited with code ${code}`);
  });
}

function normalizeArray(arr) {
  const norm = Math.sqrt(arr.reduce((acc, val) => acc + val * val, 0));
  if (norm === 0) return arr;
  return arr.map(val => val / norm);
}

function updatePosition(midpointPos, radius, puckPos, cursorPos, numPlayers) {
  try {
    // Calculate relative positions of the cursors to the puck
    const relativeCursorPos = cursorPos.map(pos => pos.map((val, idx) => val - puckPos[idx]));

    // Normalize the relative positions of the cursors
    const normalizedCursorPos = relativeCursorPos.map(pos => normalizeArray(pos));

    // Calculate the normalized direction vector of the puck
    const direction = normalizedCursorPos.reduce((acc, pos) => acc.map((val, idx) => val + pos[idx]), [0, 0]);
    const strength = Math.sqrt(direction.reduce((acc, val) => acc + val * val, 0)) / numPlayers;
    const normalizedDirection = normalizeArray(direction);

    // Calculate the timestep based on the distance and the speed of the puck
    const timestep = 3 / (100e-3);
    const stepsize = radius / timestep; // distance per timestep

    // Calculate the new position of the puck
    let newPuckPosition = puckPos.map((val, idx) => val + stepsize * normalizedDirection[idx] * strength);

    // Check if the new puck position is outside the circle, if so, set it to the edge of the circle
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
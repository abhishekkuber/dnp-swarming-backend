# import sys
# import numpy as np
# import json

# """
# Function that normalizes a given array
# """
# def normalize_array(arr):
#     norm = np.linalg.norm(arr)
#     if norm == 0: 
#         return arr  # If norm is 0, return the original array
#     return arr / norm  # Otherwise, return the normalized array

# """
# Function that returns the new position of the puck based on the current position of the puck, 
# the cursors, and the midpoint of the circle. It takes the following arguments:

# midpoint_pos: an array of the x and y coordinates of the midpoint of the circle (should be np.array(x,y))
# radius: the radius of the circle
# puck_pos: an array of the x and y coordinates of the puck (should be np.array(x,y))
# cursor_pos: a list of arrays of the x and y coordinates of the cursors (should be [np.array(x1,y1), np.array(x2,y2), ...])
# num_players: the number of players
# """ 

# def update_position(midpoint_pos, radius, puck_pos, cursor_pos, num_players):
#     # Calculate relative position of puck to midpoint
#     relative_puck_pos = puck_pos - midpoint_pos

#     # Calculate relative positions of the cursors to the puck
#     relative_cursor_pos = cursor_pos - puck_pos

#     #Normalize the relative positions of the cursors
#     relative_cursor_pos = [normalize_array(relative_cursor_pos[i]) for i in range(num_players)]

#     # Calculate the normalized direction vector of the puck 
#     direction = sum(relative_cursor_pos)
#     strength = np.linalg.norm(direction)/num_players
#     direction = normalize_array(direction)

#     # #Calculate distance from puck to edge in its moving direction and the corresponding stepsize
#     # a = relative_puck_pos[0]*direction[0] + relative_puck_pos[1]*direction[1]
#     # distance = -a + np.sqrt(a*a - np.linalg.norm(relative_puck_pos)**2 + radius**2)

#     #Calculate the timestep based on the distance and the speed of the puck
#     timestep = 2/(250e-3)
#     stepsize = radius/timestep #distance per timestep

#     #Calculate the new position of the puck
#     new_puck_position = puck_pos + stepsize*direction*strength

#     #check if the new puck position is outside the circle, if so, set it to the edge of the circle
#     if np.linalg.norm(new_puck_position - midpoint_pos) > radius:
#         position_vec = new_puck_position - midpoint_pos
#         unit_vec = normalize_array(position_vec)
#         new_puck_position = midpoint_pos + unit_vec*radius
    
#     new_puck_position = np.round(new_puck_position, 3)
    
#     return new_puck_position



# if __name__ == "__main__":
#     # # Parse input arguments from Node.js
#     # midpoint_pos = np.array(json.loads(sys.argv[1]))
#     # radius = float(sys.argv[2])
#     # puck_pos = np.array(json.loads(sys.argv[3]))
#     # cursor_pos = np.array(json.loads(sys.argv[4]))
#     # num_players = int(sys.argv[5])
    
#     # # Call the function to compute the new puck position
#     # new_puck_position = update_position(midpoint_pos, radius, puck_pos, cursor_pos, num_players)
    
#     # # Print the result as a JSON string, so Node.js can read it
#     # print(json.dumps(new_puck_position.tolist()))

#     try:
#         midpoint_pos = np.array(json.loads(sys.argv[1]))
#         radius = float(sys.argv[2])
#         puck_pos = np.array(json.loads(sys.argv[3]))
#         cursor_pos = np.array(json.loads(sys.argv[4]))
#         num_players = int(sys.argv[5])

#         # Call the function to compute the new puck position
#         new_puck_position = update_position(midpoint_pos, radius, puck_pos, cursor_pos, num_players)

#         # Print the result as a JSON string
#         print(json.dumps(new_puck_position.tolist()))

#     except Exception as e:
#         # Print an error message as JSON
#         print(json.dumps({"error": str(e)}))

import sys
import numpy as np
import json

def normalize_array(arr):
    norm = np.linalg.norm(arr)
    if norm == 0: 
        return arr  # If norm is 0, return the original array
    return arr / norm  # Otherwise, return the normalized array

def update_position(midpoint_pos, radius, puck_pos, cursor_pos, num_players):
    try:
        # Calculate relative position of puck to midpoint
        relative_puck_pos = puck_pos - midpoint_pos

        # Calculate relative positions of the cursors to the puck
        relative_cursor_pos = cursor_pos - puck_pos

        # Normalize the relative positions of the cursors
        relative_cursor_pos = [normalize_array(relative_cursor_pos[i]) for i in range(num_players)]

        # Calculate the normalized direction vector of the puck 
        direction = sum(relative_cursor_pos)
        strength = np.linalg.norm(direction) / num_players
        direction = normalize_array(direction)

        # Calculate the timestep based on the distance and the speed of the puck
        timestep = 2 / (250e-3)
        stepsize = radius / timestep  # distance per timestep

        # Calculate the new position of the puck
        new_puck_position = puck_pos + stepsize * direction * strength

        # Check if the new puck position is outside the circle, if so, set it to the edge of the circle
        if np.linalg.norm(new_puck_position - midpoint_pos) > radius:
            position_vec = new_puck_position - midpoint_pos
            unit_vec = normalize_array(position_vec)
            new_puck_position = midpoint_pos + unit_vec * radius

        new_puck_position = np.round(new_puck_position, 3)

        return new_puck_position
    except Exception as e:
        raise ValueError(f"Error in update_position: {str(e)}")

if __name__ == "__main__":
    try:
        # Parse input arguments from Node.js
        midpoint_pos = np.array(json.loads(sys.argv[1]))
        radius = float(sys.argv[2])
        puck_pos = np.array(json.loads(sys.argv[3]))
        cursor_pos = np.array(json.loads(sys.argv[4]))
        num_players = int(sys.argv[5])

        # Call the function to compute the new puck position
        new_puck_position = update_position(midpoint_pos, radius, puck_pos, cursor_pos, num_players)

        # Print the result as a JSON string
        print(json.dumps(new_puck_position.tolist()))

    except Exception as e:
        # Print an error message as JSON
        print(json.dumps({"error": str(e)}))
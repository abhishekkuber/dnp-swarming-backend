import trueskill as ts
import json
import sys

"""
Function to get POI by ID from a JSON Lines file

file_path: Path to the JSON Lines file containing the POIs
target_id: ID of the POI to retrieve
"""
def get_poi_by_id(file_path, target_id):
    with open(file_path, 'r') as file:
        for line in file:
            try:
                poi = json.loads(line)  # Parse the line as JSON
                if poi['id'] == target_id:  # Check if the ID matches
                    return poi  # Return the entire POI object
            except json.JSONDecodeError:
                print(f"Skipping malformed line: {line.strip()}")
    return None  # Return None if the ID is not found

"""
Function to add POI to a bucket

file_path: Path to the JSON Lines file containing the POIs
poi: Dictionary containing the POI data
"""
def add_poi_to_bucket(file_path, poi):
    with open(file_path, 'a') as file:
        file.write(json.dumps(poi) + '\n')
        file.flush()  # Ensure data is written to disk

"""
Function to remove a POI from a bucket

file_path: Path to the JSON Lines file containing the POIs
"""
def remove_poi_from_bucket(file_path, poi_id):
    pois = []
    
    # Read the POIs from the file
    with open(file_path, "r") as file:
        for line in file:
            try:
                poi = json.loads(line)
                pois.append(poi)
            except json.JSONDecodeError:
                print(f"Skipping malformed line: {line.strip()}")
    
    # Write the POIs back to the file, excluding the one with the specified ID
    with open(file_path, "w") as file:
        for poi in pois:
            if poi["id"] != poi_id:
                file.write(json.dumps(poi) + "\n")
        file.flush()  # Ensure data is written to disk

"""
Function to update the ratings of the POIs in the bucket and move them to the old bucket if their swarm score reaches 5

ranked_list: List of POI IDs in the order they were ranked
ranked_ratings: List of Rating objects in the order they were ranked
bucket: List of strings indicating the bucket of each POI in ranked_list
"""
def update_poi_ratings(ranked_list, ranked_ratings, bucket):
    # Update mu and sigma values in the POI objects
    for i, rating in enumerate(ranked_ratings):
        if bucket[i] == 'new_bucket':
            file_path = 'data/new_bucket.jsonl'
        else:
            file_path = 'data/old_bucket.jsonl'

        with open(file_path, 'r') as file:
            pois = [json.loads(line) for line in file]

        for poi in pois:
            if poi['id'] == ranked_list[i]:
                poi['mu'] = rating[0].mu
                poi['sigma'] = rating[0].sigma
                poi['swarm_score'] += 1
                if bucket[i] == 'new_bucket' and poi['swarm_score'] == 5:
                    # Add poi to old bucket
                    add_poi_to_bucket("data/old_bucket.jsonl", poi)

                    # Remove from data/new_bucket.jsonl
                    remove_poi_from_bucket('data/new_bucket.jsonl', poi['id'])
                    # Remove poi from pois list
                    pois.remove(poi)

        # Write the updated POIs back to the file
        with open(file_path, 'w') as file:
            for poi in pois:
                file.write(json.dumps(poi) + '\n')
            file.flush()  # Ensure data is written to disk

"""
Function to alter the rating based on the ranked list of POIs.
The function updates the ratings in the buckets.
If the swarm score of a POI in the new bucket reaches 5, it is moved to the old bucket. 

ranked_list: List of POI IDs in the order they were ranked
"""
def rating_and_updating_buckets(ranked_list):
    ratings = []  # List to store the Rating objects
    bucket = []

    file_path = 'data/new_bucket.jsonl'
    # Retrieve POIs and create Rating objects
    for target_id in ranked_list:
        poi = get_poi_by_id(file_path, target_id)
        if poi is not None:
            ratings.append(ts.Rating(poi['mu'], poi['sigma']))
            bucket.append('new_bucket')
        else:
            file_path = 'data/old_bucket.jsonl'
            poi = get_poi_by_id(file_path, target_id)
            if poi is not None:
                ratings.append(ts.Rating(poi['mu'], poi['sigma']))
                bucket.append('old_bucket')
            else:
                print(f'POI with ID {target_id} not found')

    # Rank the ratings based on their position in ranked_list
    ranked_ratings = ts.rate([(rating,) for rating in ratings], ranks=list(range(len(ratings))))
    update_poi_ratings(ranked_list, ranked_ratings, bucket)

    return 0

if __name__ == "__main__":
    # Parse input arguments from Node.js
    ranked_list = json.loads(sys.argv[1])

    result = rating_and_updating_buckets(ranked_list)
    # Print the result as a JSON string, so Node.js can read it
    print(json.dumps(result))
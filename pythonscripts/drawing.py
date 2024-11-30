import random
import json
import sys

"""
This function extracts the IDs and fitness values of the POIs from a JSONL file.

Args:
    file_path (str): The path to the JSONL file.

Returns:
    tuple: A tuple containing two lists. The first list contains the IDs of the POIs, and the second list contains the fitness values of the POIs
"""

def extract_id_mu(file_path):
    IDs = []
    fitnesses = []
    with open(file_path, 'r') as file:
        for line in file:
            try:
                poi = json.loads(line)
                IDs.append(poi['id'])
                fitnesses.append(poi['mu'])
            except json.JSONDecodeError:
                print(f"Skipping malformed line: {line.strip()}")
    return IDs, fitnesses

"""
This function extracts the IDs, fitness values, and swarm scores of the POIs from a JSONL file.

Args:
    file_path (str): The path to the JSONL file.

Returns:
    tuple: A tuple containing three lists. The first list contains the IDs of the POIs, the second list contains the fitness values of the POIs, and the third list contains the swarm scores of the POIs.
"""
def extract_id_mu_swarmscore(file_path):
    IDs = []
    fitnesses = []
    swarmscores = []
    with open(file_path, 'r') as file:
        for line in file:
            try:
                poi = json.loads(line)
                IDs.append(poi['id'])
                fitnesses.append(poi['mu'])
                swarmscores.append(poi['swarm_score'])
            except json.JSONDecodeError:
                print(f"Skipping malformed line: {line.strip()}")
    return IDs, fitnesses, swarmscores


"""
This function draws the titles of the POIs 
"""
def draw_title(IDs, filepath):
    id_to_title = {}

    with open(filepath, 'r') as file:
        for line in file:
            try:
                poi = json.loads(line)
                if poi['id'] in IDs:
                    id_to_title[poi['id']] = poi['title']
            except json.JSONDecodeError:
                print(f"Skipping malformed line: {line.strip()}")

    # Construct the list of titles based on the order of IDs
    titles = [id_to_title[id] for id in IDs if id in id_to_title]
    return titles

"""
This function draws N POIs from the old bucket based on the fitness values of the POIs.

Args:
    N (int): The number of POIs to draw from the old bucket.

Returns:
    list: A list of N POI IDs drawn from the old bucket.
"""
def draw_from_old_bucket(N):
    IDs, fitnesses = extract_id_mu('data/old_bucket.jsonl')
    picked_IDs = []

    i = 0
    while i < N and IDs:
        i += 1
        total_fitness = sum(fitnesses)
        random_number = random.uniform(0, total_fitness)
        cumulative_fitness = 0
        for j in range(len(IDs)):
            cumulative_fitness += fitnesses[j]
            if cumulative_fitness >= random_number:
                picked_IDs.append(IDs[j])
                
                # Remove the picked ID from the list
                del IDs[j]
                del fitnesses[j]
                break  # Exit the loop once an ID is picked
    
    titles = draw_title(picked_IDs, 'data/old_bucket.jsonl')
    return picked_IDs, titles

"""
This function draws N POIs from the new bucket based on the swarm scores of the POIs.

Args:
    N (int): The number of POIs to draw from the new bucket.

Returns:
    list: A list of N POI IDs drawn from the new bucket.
"""
def draw_from_new_bucket(N):
    IDs, fitnesses, swarm_scores = extract_id_mu_swarmscore('data/new_bucket.jsonl')
    # Sort the IDs based on the swarmscore
    sorted_IDs = [x for _, x in sorted(zip(swarm_scores, IDs))]

    titles = draw_title(sorted_IDs[:N], 'data/new_bucket.jsonl')
    return sorted_IDs[:N], titles


"""
This function extracts the one-liner and description of the POIs from the JSONL files.

Args:
    IDs (list): A list of POI IDs.

Returns:
    tuple: A tuple containing two lists. The first list contains the one-liners of the POIs, and the second list contains the descriptions of the POIs.
"""
def information(IDs):
    oneliner = []
    description = []

    filepaths = ['data/new_bucket.jsonl', 'data/old_bucket.jsonl']

    for filepath in filepaths:
        with open(filepath, 'r') as file:
            for line in file:
                try:
                    poi = json.loads(line)
                    if poi['id'] in IDs:
                        oneliner.append(poi['one_liner'])
                        description.append(poi['description'])
                except json.JSONDecodeError:
                    print(f"Skipping malformed line: {line.strip()}")

    return oneliner, description

if __name__ == "__main__":
    N_new = int(sys.argv[1])
    N_old = int(sys.argv[2])

    picked_old, titles_old = draw_from_old_bucket(N_old)
    picked_new, titles_new = draw_from_new_bucket(N_new)

    picked_total = picked_new + picked_old
    picked_titles = titles_new + titles_old
    picked_oneliners, picked_descriptions = information(picked_total)

    print(json.dumps([picked_total, picked_titles, picked_oneliners, picked_descriptions]))
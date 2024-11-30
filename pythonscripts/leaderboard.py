import json
import sys
"""
Function to read the mu and title from the jsonl file

Args:
    filepath (str): The path to the JSONL file.

Returns:
    tuple: A tuple containing two lists. The first list contains the mu of the POIs, and the second list contains the titles of the POIs.
"""
def draw_mu_title(filepath):
    with open(filepath, 'r') as file:
        mu = []
        title = []
        for line in file:
            try:
                poi = json.loads(line)
                mu.append(poi['mu'])
                title.append(poi['title'])
            except json.JSONDecodeError:
                print(f"Skipping malformed line: {line.strip()}")
    return mu, title

"""
Function to read the mu and title from the jsonl file

Args:
    N (int): The number of POIs to return.

Returns:
    list: A list containing the titles of the top N POIs based on mu.
"""
def get_leaderbord(N):
    NewMu, NewTitle = draw_mu_title('data/new_bucket.jsonl')
    OldMu, OldTitle = draw_mu_title('data/old_bucket.jsonl')

    muList = NewMu + OldMu
    titleList = NewTitle + OldTitle

    assert N <= len(muList), f"Number of POIs requested ({N}) is greater than the number of POIs available ({len(muList)})"

    #Get the top N POIs titles based on mu
    topN = sorted(range(len(muList)), key=lambda i: muList[i], reverse=True)[:N]

    topN_titles = [titleList[i] for i in topN]

    return topN_titles

if __name__ == "__main__":
    N = int(sys.argv[1])
    leaderbord = get_leaderbord(N)

    print(json.dumps(leaderbord))
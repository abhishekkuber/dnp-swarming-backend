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
        sigma = []
        swarm_score = []
        for line in file:
            try:
                poi = json.loads(line)
                mu.append(round(poi['mu'], 2))
                title.append(poi['title'])
                sigma.append(round(poi['sigma'], 2))
                swarm_score.append(poi['swarm_score'])
            except json.JSONDecodeError:
                print(f"Skipping malformed line: {line.strip()}")
    return mu, title, sigma, swarm_score

"""
Function to read the mu and title from the jsonl file

Args:
    N (int): The number of POIs to return.

Returns:
    list: A list containing the titles of the top N POIs based on mu.
"""
# def get_leaderbord(N):
#     NewMu, NewTitle = draw_mu_title('data/new_bucket.jsonl')
#     OldMu, OldTitle = draw_mu_title('data/old_bucket.jsonl')

#     muList = NewMu + OldMu
#     titleList = NewTitle + OldTitle

#     assert N <= len(muList), f"Number of POIs requested ({N}) is greater than the number of POIs available ({len(muList)})"

#     #Get the top N POIs titles based on mu
#     topN = sorted(range(len(muList)), key=lambda i: muList[i], reverse=True)[:N]

#     topN_titles = [titleList[i] for i in topN]

#     return topN_titles


def get_leaderbord():
    NewMu, NewTitle, NewSigma, NewSwarmScore = draw_mu_title('data/new_bucket.jsonl')
    OldMu, OldTitle, OldSigma, OldSwarmScore = draw_mu_title('data/old_bucket.jsonl')

    muList = NewMu + OldMu 
    titleList = NewTitle + OldTitle 
    sigmaList = NewSigma + OldSigma
    swarmScoreList = NewSwarmScore + OldSwarmScore

    #Get the top N POIs titles based on mu
    zipped = zip(muList, titleList, sigmaList, swarmScoreList)
    zipped = sorted(zipped, key=lambda x: x[0], reverse=True)
    leaderboard = [{"mu": mu, "title": title, "sigma": sigma, "swarmScore": swarmScore} for mu, title, sigma, swarmScore in zipped]
    return leaderboard

    # topN = sorted(range(len(muList)), key=lambda i: muList[i], reverse=True)
    # topN_titles = [titleList[i] for i in topN]
    # return topN_titles

if __name__ == "__main__":
    # N = int(sys.argv[1])
    # leaderbord = get_leaderbord(N)
    leaderbord = get_leaderbord()

    print(json.dumps(leaderbord))
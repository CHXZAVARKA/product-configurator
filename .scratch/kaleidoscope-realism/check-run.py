"""Validate durable ticket graph/state and candidate ancestry; never mutate the tracker."""
import json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent
state=json.loads((root/'run.json').read_text());tickets=state['tickets'];seen=set()
def git(*args):return subprocess.check_output(['git',*args],cwd=root,text=True).strip()
def visit(number,stack):
 assert number not in stack, f'Cycle at {number}'
 ticket=tickets[number]
 assert (root.parents[1]/ticket['file']).is_file(), ticket['file']
 for blocker in ticket['blocked_by']:
  assert blocker in tickets,f'Missing blocker {blocker}'
  visit(blocker,stack|{number})
 seen.add(number)
for n in tickets:visit(n,set())
for n,t in tickets.items():
 if t['state'] in ('RUNNING','CANDIDATE','INTEGRATED'):
  assert all(tickets[b]['state']=='INTEGRATED' for b in t['blocked_by']),f'{n} started before integration of blocker'
  assert t.get('base_integration_sha'),f'{n}: missing base'
 if t['state'] in ('CANDIDATE','INTEGRATED'):
  assert t.get('candidate_sha') and t.get('checks'),f'{n}: no immutable candidate/evidence'
  subprocess.run(['git','merge-base','--is-ancestor',t['base_integration_sha'],t['candidate_sha']],cwd=root,check=True)
 if t['state']=='INTEGRATED':
  assert t.get('integration_sha'),f'{n}: no integration commit'
  subprocess.run(['git','merge-base','--is-ancestor',t['candidate_sha'],t['integration_sha']],cwd=root,check=True)
 if t['state']=='INCOMPLETE':assert t.get('evidence'),f'{n}: incomplete without evidence'
frontier=[n for n,t in tickets.items() if t['state'] in ('PENDING','RUNNING') and all(tickets[b]['state']=='INTEGRATED' for b in t['blocked_by'])]
assert frontier==state['frontier'],(frontier,state['frontier'])
assert git('rev-parse',state['spec_fixed_point'])==state['spec_fixed_point']
print(json.dumps({'status':'PASS','spec_fixed_point':state['spec_fixed_point'],'states':{n:t['state'] for n,t in tickets.items()},'frontier':frontier},indent=2))

import {readFileSync} from 'node:fs';
import {basename} from 'node:path';

const [baselinePath,branchPath]=process.argv.slice(2);
if(!baselinePath||!branchPath)throw Error('usage: node tools/swapp-quantic-ci-baseline.mjs base.tap branch.tap');
function scan(file){
 const tap=readFileSync(file,'utf8');
 const titles=tap.split(/\r?\n/).map(l=>/^\s*not ok\s+\d+\s+-\s+(.+)$/.exec(l)?.[1]?.trim()).filter(Boolean);
 const counts=new Map();
 for(const title of titles)counts.set(title,(counts.get(title)||0)+1);
 const count=/# tests (\d+)/.exec(tap)?.[1];
 const failures=/# fail (\d+)/.exec(tap)?.[1];
 return {counts,titles,testCount:Number(count||0),failureCount:Number(failures||0)};
}
const base=scan(baselinePath),current=scan(branchPath);
if(!base.testCount||!current.testCount)throw Error('Incomplete TAP summary: refuse to accept an inconclusive regression run');
const remaining=new Map(base.counts),added=[];
for(const title of current.titles){
 const seen=remaining.get(title)||0;
 if(seen)remaining.set(title,seen-1);
 else added.push(title);
}
const removed=[];
for(const [name,count] of remaining)for(let i=0;i<count;i++)removed.push(name);
const report={
 baselineTests:base.testCount,
 baselineFailures:base.failureCount,
 branchTests:current.testCount,
 branchFailures:current.failureCount,
 newFailures:added,
 baselineFailuresAbsentFromBranch:removed.length
};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
if(added.length)throw Error('New full-suite failures compared with the exact existing master baseline');
if(current.testCount<base.testCount)throw Error('The Quantic branch executes fewer tests than master');
process.stdout.write('No NEW full-suite test failures relative to existing master.\n');

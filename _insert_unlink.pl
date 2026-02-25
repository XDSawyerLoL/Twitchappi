use strict; use warnings;
local $/;
my $f = 'app.js';
open my $fh,'<',$f or die $!;
my $s = <$fh>; close $fh;
my $needle = "app.post('/api/steam/logout', (req, res) => {\n  try{\n    if(req.session) req.session.steam = null;\n  }catch(_){ }\n  return res.json({ success:true });\n});\n";
# normalize to actual (in file it's }catch(_){})
$needle = "app.post('/api/steam/logout', (req, res) => {\n  try{\n    if(req.session) req.session.steam = null;\n  }catch(_){}\n  return res.json({ success:true });\n});\n";
my $insert = $needle.
"\n// Remove the persisted Steam link for the current Twitch user\n".
"app.post('/api/steam/unlink', async (req, res) => {\n".
"  try{\n".
"    const tu = requireTwitchSession(req, res);\n".
"    if(!tu) return;\n".
"    await setBillingSteam(tu, null);\n".
"    if(req.session) req.session.steam = null;\n".
"    return res.json({ success:true });\n".
"  }catch(e){\n".
"    return res.status(500).json({ success:false, error:e.message });\n".
"  }\n".
"});\n";

if(index($s, $needle) == -1){
  die "needle not found";
}
$s =~ s/\Q$needle\E/$insert/;
open my $oh,'>',$f or die $!; print $oh $s; close $oh;
print "ok\n";

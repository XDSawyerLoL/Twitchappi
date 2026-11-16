'use strict';
const {parseVideoUrl}=require('../lib/swapp-creator-external-videos');
const THEMES=Object.freeze(['obsidian','glacier','ember']);
const MAX_STORIES=4;
class StoryInputError extends Error{
 constructor(code){super(code);this.name='StoryInputError';this.code=code}
}
function normalizeStory(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new StoryInputError('story_invalid');
 const title=String(input.title??'').trim().slice(0,90);
 const caption=String(input.caption??'').trim().slice(0,300);
 if(title.length<3)throw new StoryInputError('story_title_required');
 const theme=THEMES.includes(input.theme)?input.theme:'obsidian';
 const supplied=String(input.videoUrl??'').trim();
 const video=supplied?parseVideoUrl(supplied):null;
 if(supplied&&!video)throw new StoryInputError('story_video_unsupported');
 return {title,caption,theme,videoUrl:video?.url||''};
}
module.exports={THEMES,MAX_STORIES,StoryInputError,normalizeStory};

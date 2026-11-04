import {slides as originals} from './slides';
const alts=[
 'Flowers growing on a grassy hillside','A close view of fine leaves and stems','A grassy valley surrounded by mountains','Frost along the surfaces and edges of leaves','A snow-covered mountain above woodland','A patch of flowering plants in the light','Water flowing between rocks in a forest','A tree in grassland beneath a cloudy sky','Grass seed heads in shallow focus','Clouds over mountain ridges and a valley','Leaf veins and textured surfaces','A bare tree on a snowy slope','A waterfall on a misty forested slope','Branches in front of distant mountains','Grass emerging between patches of snow','A rocky mountain ridge covered in snow','A quiet stretch of water surrounded by forest','Cultivated fields in an open landscape','A distant bright peak framed by dark mountain silhouettes','Mist and cloud across a mountain ridge',
];
export const slides=originals.map((s,i)=>({...s,caption:s.caption.split(' / ')[0],alt:alts[i]}));

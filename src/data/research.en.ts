// Core terminology and descriptions checked against the original English Research page.
import { themes as originals } from './research';
const translations=[
 {title:'Plant freezing adaptation',menu:'Freezing adaptation',lead:'We study cold acclimation, deacclimation and reacclimation as a continuous response, asking how plants coordinate freezing tolerance and growth.',
 sections:[
  {heading:'Freezing injury and cold acclimation',paragraphs:[
   'When plant tissues freeze, ice initially forms outside the cells. Ice formation draws water out of the cells, causing dehydration and deformation. Growing ice can also exert mechanical forces that damage membranes and cellular structures. Understanding freezing tolerance therefore requires attention to water movement and to the properties of the structures surrounding each cell, as well as temperature.',
   'Many plants become more tolerant of subsequent freezing after exposure to low, non-freezing temperatures. During this process, called cold acclimation, sugar accumulation, membrane properties and cell wall composition change. Growth is also suppressed as plants adjust the allocation of resources between growth and protection.',
  ]},
  {heading:'Deacclimation after warming',paragraphs:[
   'When temperatures rise, plants reduce freezing tolerance and resume growth. This process, termed deacclimation, balances stress tolerance and growth under variable temperatures. If cold conditions return, the rate of tolerance loss and the capacity to regain tolerance can affect survival.',
   'We examine acclimation and deacclimation not only as separate physiological states, but also as a transition. In particular, we investigate how sugars and cell wall properties change through that transition, and which changes persist.',
  ]},
  {heading:'Environmental history in sugars and cell walls',paragraphs:[
   'We examined carbohydrate dynamics during cold acclimation and deacclimation, focusing on soluble sugars and cell wall-related components. Soluble sugars and specific cell wall components increased during cold acclimation, whereas soluble sugars decreased during deacclimation while some cell wall components were retained. Re-acclimated plants exhibited higher freezing tolerance than during the initial acclimation.',
   'These findings suggest that deacclimation does not necessarily reset the plant completely, and that an earlier cold experience may influence a later response. The mechanisms connecting retained cell wall changes with enhanced tolerance remain to be tested.',
  ]},
  {heading:'Current questions',paragraphs:[
   'By comparing cold acclimation, deacclimation and reacclimation, we investigate the relationships among soluble sugars, cell wall polysaccharides, freezing tolerance and growth. We aim to determine how environmental history is retained in structure, and how that persistence affects subsequent tolerance acquisition and the resumption of growth.',
  ]},
 ],keywords:['Cold acclimation','Deacclimation','Reacclimation','Environmental memory'],figure:'cold-acclimation.webp',caption:'Cold acclimation and deacclimation.',alt:'Plant responses to freezing and changes in leaf area during cold acclimation and deacclimation.'},
 {title:'Cell wall and storage polysaccharides in plant adaptation',menu:'Cell wall and storage polysaccharides',lead:'We study the structure and metabolism of cell wall and storage polysaccharides and their possible roles in environmentally induced changes in growth and morphology.',
 sections:[
  {heading:'Polysaccharides in the cell wall',paragraphs:[
   'Plant cell walls contain cellulose, hemicelluloses and pectins. The sugars they contain, the bonds between them and the arrangement of the polymers affect wall strength and deformability. Cell walls support cell shape and are remodelled as plants grow.',
   'We measure sugar composition and linkage patterns and examine where polysaccharides occur in tissues. Together with analyses of genes involved in their synthesis and breakdown, these approaches help us understand how walls change with the environment.',
  ]},
  {heading:'Storage polysaccharides and adaptation',paragraphs:[
   'Storage polysaccharides such as starch and fructans allow plants to store sugars and use them when needed. Their accumulation and breakdown contribute to energy supply for growth and regulation of cellular sugar levels.',
   'We compare changes in their abundance and structure in leaves and crowns under cold conditions and day–night temperature fluctuations. Studying storage metabolism alongside wall remodelling helps us connect sugar use with stress adaptation.',
  ]},
  {heading:'Cold-induced changes in plant morphology',paragraphs:[
   'Cold-treated komatsuna can develop thicker leaves and uneven leaf surfaces. Such changes may involve sugar accumulation, cell expansion and division, and cell wall properties.',
   'We investigate how polysaccharide structure and metabolism relate to the shape and physical properties of cells and tissues. These observations connect molecular responses with visible changes in plants exposed to cold.',
  ]},
 ],keywords:['Cell walls','Starch','Fructans','Cold-induced morphology'],figure:'',video:'komatsuna-cold.mp4',poster:'komatsuna-poster.webp',autoplay:true,caption:'Komatsuna grown under cold conditions (time-lapse).',alt:'Time-lapse of komatsuna growing under cold conditions, with uneven leaf surfaces.'},
 {title:'Desiccation tolerance and sugars in resurrection plants',menu:'Desiccation tolerance',lead:'We compare Selaginella tamariscina with a related species to study how trehalose, other sugars and cell walls contribute to protection during drying and recovery after rehydration.',
 sections:[
  {heading:'What are resurrection plants?',paragraphs:[
   'Severe drying damages membranes and deforms cell walls in many land plants, making recovery difficult. Resurrection plants can maintain cellular structure through extreme drying and resume biological activity when water becomes available again. Selaginella tamariscina is one example of a plant with this exceptional desiccation tolerance.',
   'The visible contraction of a drying plant and its reopening after watering provide a starting point for studying how cells and tissues deform while maintaining their structural integrity.',
  ]},
  {heading:'Comparing related species',paragraphs:[
   'The accumulation of sugars such as trehalose has been implicated in desiccation tolerance. However, the related species S. moellendorffii accumulates trehalose without showing the same degree of tolerance as S. tamariscina. Membrane properties, protective proteins and cell walls must therefore be considered alongside sugars.',
   'We compare these two closely related species with contrasting tolerance to identify cell wall features associated with that difference. We study the transition from drying to rehydration as well as the dry state itself.',
  ]},
  {heading:'Drying and rehydration from a cell wall perspective',paragraphs:[
   'As cells lose volume during dehydration, their walls and membranes undergo substantial deformation. Surviving drying requires tolerance of that deformation and the capacity to regain function after rehydration. We focus on how cell wall polysaccharide composition and structure affect deformation and tissue protection.',
   'Our laboratory investigates desiccation tolerance by comparing S. tamariscina and S. moellendorffii, with a particular focus on the cell wall’s role in stress resistance. This work contributes to understanding the evolutionary survival strategies of land plants, including shared and distinct features of dehydration caused by freezing and by drying.',
  ]},
 ],keywords:['Selaginella','Trehalose','Drying and rehydration','Cell wall deformation','Comparative physiology'],figure:'',video:'selaginella-rehydration.mp4',poster:'selaginella-poster.jpg',autoplay:false,caption:'Time-lapse of morphological changes in Selaginella tamariscina during drying and rehydration.',alt:'Time-lapse of Selaginella tamariscina during drying and rehydration'},
 {title:'Exploring stress adaptation with protein language models',menu:'Protein language models',
 lead:'Intrinsically disordered proteins (IDPs) help diverse organisms, including plants and animals, adapt to stresses such as freezing and desiccation. We ask what kinds of proteins protect cells across these different organisms.',
 sections:[
  {heading:'Protecting cells as they lose water',paragraphs:[
   'Freezing and drying are distinct processes, but both can draw water out of cells. As cellular components become more concentrated, proteins can aggregate and membranes can be damaged. Limiting this damage helps cells resume activity when water returns.',
   'IDPs can adopt many shapes rather than settling into a single stable structure. Different organisms use different proteins, from plant dehydrins to proteins involved in tardigrade desiccation tolerance. We study how flexibility and interactions with nearby molecules can help protect cells under different conditions.',
  ]},
  {heading:'Comparing proteins across species',paragraphs:[
   'Proteins that perform similar roles can have quite different amino acid sequences. Direct sequence comparisons may miss those similarities. We use a protein language model that has learned patterns from large collections of amino acid sequences.',
   'We use the patterns identified by the model to build a map in which proteins with similar sequence features sit near one another. We look for candidates near known protective proteins and ask which candidates are produced during stress. This helps us decide what to test in the laboratory.',
  ]},
  {heading:'Testing the predictions',paragraphs:[
   'Closeness on the map gives us a hypothesis to test. We measure whether individual candidates prevent other proteins from aggregating or protect membranes during water loss and rehydration.',
   'We also compare individual proteins with combinations. The aim is to distinguish mechanisms that help in both freezing and drying from those that are specific to a particular organism or environment.',
  ]},
 ],keywords:['Protein language models','IDPs','Freezing','Desiccation'],figure:'esm-landscape-en.svg',caption:'From sequence comparison to experimental tests',alt:'Four steps: collect protein sequences, compare them using a language model, select candidates and test their protective activity.'},
];
export const themes=originals.map((theme,i)=>({...theme,...translations[i]}));

// Core terminology and descriptions checked against the original English Research page.
import { themes as originals } from './research';
const translations=[
 {title:'Plant Freezing Adaptation',lead:'We study cold acclimation, deacclimation and reacclimation as a continuous response, asking how plants coordinate freezing tolerance and growth.',
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
 ],keywords:['Cold acclimation','Deacclimation','Reacclimation','Environmental memory'],figure:'cold-acclimation-schematic-en.svg',caption:'Cold acclimation, deacclimation and reacclimation',alt:'Changes in freezing tolerance under cold and warm conditions.'},
 {title:'Polysaccharides in Adaptation',lead:'We connect polysaccharide structure, tissue mechanics and survival after freezing to investigate the role of cell walls in cold adaptation.',
 sections:[
  {heading:'Polysaccharides in the cell wall',paragraphs:[
   'Plant cell walls contain polysaccharides including cellulose, hemicelluloses and pectins. Their abundance, linkage patterns and arrangement affect wall strength and deformability. The wall supports cell shape while also being remodelled as the plant grows.',
   'During freezing, extracellular ice grows and cells deform as they lose water. Cell wall properties are therefore likely to influence responses to freezing and dehydration. Alongside measuring changes in polysaccharide composition, we investigate how those changes relate to tissue mechanics and tolerance.',
  ]},
  {heading:'β-1,4-Galactan during cold acclimation',paragraphs:[
   'Our work has shown that β-1,4-galactan, a side-chain component of pectin, increases during cold acclimation. This response has been observed in Arabidopsis and several vegetables. Mutants with reduced β-1,4-galactan synthesis show lower freezing tolerance after cold acclimation, together with differences in the mechanical changes observed in wild-type tissues.',
   'These findings demonstrate that changes in cell wall polysaccharides contribute to the acquisition of freezing tolerance. The physical processes through which polysaccharide accumulation alleviates freezing injury still require further investigation.',
  ]},
  {heading:'Connecting structure with function',paragraphs:[
   'We analyse the monosaccharide composition of cell walls and use glycosidic linkage analysis to examine how the sugars are connected. We combine these approaches with antibody-based localization of particular polysaccharides, analyses of genes involved in their synthesis, and measurements of the physical properties of leaves.',
   'By comparing these measurements with survival after freezing and tissue morphology, we investigate how polysaccharide abundance and structure relate to physiological function. Visible changes, such as the uneven leaf surfaces of cold-treated komatsuna, are also part of our research.',
  ]},
  {heading:'Storage polysaccharides and adaptation',paragraphs:[
   'Remodelling of cell wall polysaccharides, together with the turnover of storage polysaccharides such as starch and fructans, contributes to osmotic adjustment and structural stability. By integrating cell wall remodelling, polysaccharide metabolism and morphology, we aim to clarify the mechanisms of plant adaptation to low-temperature environments.',
  ]},
 ],keywords:['Cell walls','β-1,4-Galactan','Tissue mechanics','Starch and fructans'],figure:'cell-wall-schematic-en.svg',caption:'Cold-induced galactan accumulation',alt:'Galactan accumulation and testing in mutants.'},
 {title:'Desiccation tolerance and sugars in resurrection plants',lead:'We compare Selaginella tamariscina with a related species to study how trehalose, other sugars and cell walls contribute to protection during drying and recovery after rehydration.',
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
 ],keywords:['Selaginella','Trehalose','Drying and rehydration','Cell wall deformation','Comparative physiology'],figure:'',caption:'Time-lapse of morphological changes in Selaginella tamariscina during drying and rehydration.',alt:''},
 {title:'An ESM landscape of intrinsically disordered proteins',
 lead:'We use the ESM-2 protein language model to compare disordered proteins across species and select candidates for experiments on desiccation tolerance.',
 sections:[
  {heading:'From sequences to a comparative map',paragraphs:['Intrinsically disordered proteins (IDPs) do not adopt a single stable three-dimensional structure under physiological conditions. Some, including members of the LEA family, help protect cells during dehydration. Similar protective roles can occur in proteins with quite different sequences.','ESM-2 converts amino acid sequences into numerical representations that capture sequence context. Comparing these representations gives us a landscape of candidates from different species. We use expression during drying and predicted disorder to guide candidate selection.']},
  {heading:'Testing function',paragraphs:['Closeness in this landscape suggests a relationship worth testing. We examine whether selected proteins help maintain protein solubility or protect membranes during dehydration and rehydration, and whether combinations have different effects from individual proteins.']},
 ],keywords:['ESM-2','IDPs','Desiccation tolerance'],figure:'esm-landscape-en.svg',caption:'From sequence comparison to experimental tests',alt:'Four steps: collect sequences, encode them with ESM-2, compare candidates with expression data, and test protective activity.'},
];
export const themes=originals.map((theme,i)=>({...theme,...translations[i]}));

export type GeoHousehold = { id:string; beneficiaryId:string; label:string; lat:number; lng:number };
export type GeoVillage = { id:string; name:string; block:string; district:string; center:[number,number]; boundary:Array<[number,number]>; households:GeoHousehold[] };
export const demoDistricts=['Sample District A','Sample District B','Sample District C'];
export const villages:GeoVillage[]=[
 {id:'village-pipal',name:'Pipalwadi',block:'Demo Block A',district:demoDistricts[0],center:[21.150,79.080],boundary:[[21.155,79.071],[21.157,79.086],[21.148,79.092],[21.144,79.079]],households:[{id:'HH-01',beneficiaryId:'BEN-1001',label:'Sunita household',lat:21.151,lng:79.078},{id:'HH-02',beneficiaryId:'BEN-1002',label:'Anita household',lat:21.153,lng:79.086}]},
 {id:'village-lotus',name:'Lotuswadi',block:'Demo Block A',district:demoDistricts[1],center:[21.164,79.094],boundary:[[21.169,79.087],[21.172,79.099],[21.160,79.104],[21.157,79.091]],households:[{id:'HH-03',beneficiaryId:'BEN-1003',label:'Rekha household',lat:21.164,lng:79.096},{id:'HH-04',beneficiaryId:'BEN-1005',label:'Aarav household',lat:21.168,lng:79.093}]},
 {id:'village-river',name:'Riverbend',block:'Demo Block B',district:demoDistricts[2],center:[21.137,79.103],boundary:[[21.143,79.096],[21.145,79.107],[21.133,79.111],[21.131,79.099]],households:[{id:'HH-05',beneficiaryId:'BEN-1004',label:'Meena household',lat:21.138,lng:79.104}]},
];
export const facility={name:'Sample PHC North',label:'Sample facility',lat:21.155,lng:79.105,distance:'1.8 km'};

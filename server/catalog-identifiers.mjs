/** A catalog list number is NOT an institution asset ID. Never coerce generic 물품번호. */
export function splitListingNumber(value){
 const input=String(value??'').trim().normalize('NFKC');
 if(!input)return null;
 const match=/^(\d{8})[\s-]?(\d{8})$/.exec(input);
 if(!match)throw Object.assign(new Error('물품목록번호는 분류번호 8자리-식별번호 8자리 형식입니다.'),{status:400});
 return {listingNo:match[1]+'-'+match[2],classificationCode:match[1],identificationCode:match[2]};
}

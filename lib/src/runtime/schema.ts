import { Type } from 'typebox';
export const object = (properties: any) => Type.Object(properties, { additionalProperties: false });

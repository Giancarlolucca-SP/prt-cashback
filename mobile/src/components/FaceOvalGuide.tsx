import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import Svg, { Defs, Ellipse, Mask, Rect } from 'react-native-svg';

const { width: W, height: H } = Dimensions.get('window');

export const OVAL_W = 300;
export const OVAL_H = 400;

const OVAL_CENTER_X = W / 2;
const OVAL_CENTER_Y = H / 2 - 20;

export const OVAL_TOP  = OVAL_CENTER_Y - OVAL_H / 2;
export const OVAL_LEFT = OVAL_CENTER_X - OVAL_W / 2;

export const OVAL_Y_FRACTION = OVAL_CENTER_Y / H;

export default function FaceOvalGuide() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">

      {/* Layer 2 — Dark mask with oval cutout */}
      <Svg style={{ position: 'absolute', top: 0, left: 0 }} width={W} height={H}>
        <Defs>
          <Mask id="face-oval-mask">
            <Rect x={0} y={0} width={W} height={H} fill="white" />
            <Ellipse
              cx={OVAL_CENTER_X}
              cy={OVAL_CENTER_Y}
              rx={OVAL_W / 2}
              ry={OVAL_H / 2}
              fill="black"
            />
          </Mask>
        </Defs>
        <Rect
          x={0} y={0}
          width={W} height={H}
          fill="rgba(0,0,0,0.62)"
          mask="url(#face-oval-mask)"
        />
      </Svg>

    </View>
  );
}

const styles = StyleSheet.create({});

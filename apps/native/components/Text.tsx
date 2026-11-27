/**
 * 기본 글꼴이 SUIT 인 Text / TextInput (Night Pool, DESIGN.md Typography).
 *
 * RN 에는 전역 기본 글꼴 API 가 없고 React 19 는 함수 컴포넌트 defaultProps 를 무시하므로,
 * 앱 코드는 react-native 대신 이 파일의 Text·TextInput 을 쓴다 (eslint no-restricted-imports 가 강제).
 *
 * - 가장 바깥 Text 에만 SUIT 를 깐다. 안쪽 Text 는 부모 글꼴을 그대로 물려받아야 하므로
 *   (예: 데이터 글꼴 문장 안의 강조 span) context 로 중첩 여부를 보고 기본값을 생략한다.
 * - fontWeight 만 줘도 iOS 는 같은 family(SUIT 400·600·800·900)에서 가장 가까운 굵기를 고른다
 *   (RCTFontUtils — PostScript 이름을 family 로 풀어 굵기 매칭).
 * - style 에 fontFamily 를 주면 그대로 우선한다.
 */
import { createContext, useContext, type ComponentPropsWithRef } from 'react';
import { Text as RNText, TextInput as RNTextInput } from 'react-native';
import { fontsV2 } from '../lib/tokens';

const BASE = { fontFamily: fontsV2.body };
const InsideText = createContext(false);

export function Text({ style, ...rest }: ComponentPropsWithRef<typeof RNText>) {
  const nested = useContext(InsideText);
  if (nested) return <RNText {...rest} style={style} />;
  return (
    <InsideText.Provider value>
      <RNText {...rest} style={[BASE, style]} />
    </InsideText.Provider>
  );
}

export function TextInput({ style, ...rest }: ComponentPropsWithRef<typeof RNTextInput>) {
  return <RNTextInput {...rest} style={[BASE, style]} />;
}

/** TextInput ref 타입 (useRef<TextInputHandle>) — RN TextInput 인스턴스 그대로. */
export type TextInputHandle = RNTextInput;

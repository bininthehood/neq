/**
 * "검색" 탭 자리표시 라우트.
 *
 * 하단 탭의 검색은 `_layout.tsx` 에서 tabPress 를 preventDefault 하고 모달 시트를
 * 열기 때문에 이 화면은 실제로 진입하지 않는다. expo-router 가 탭 엔트리를
 * 만들려면 라우트 파일이 있어야 해서 stub 만 둔다.
 *
 * ponytail: 직접 진입(딥링크 등) 시에는 발견으로 되돌린다.
 */
import { Redirect } from 'expo-router';

export default function SearchTabPlaceholder() {
  return <Redirect href="/" />;
}

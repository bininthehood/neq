import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Persona } from '../lib/types';
import { colors, radius, spacing } from '../lib/tokens';
import { fonts } from '@neq/design';
import { IconClose } from './Icons';

/**
 * PersonaSection — Profile 탭의 취향(페르소나) 리스트 + 전환/삭제/생성 UI.
 *
 * web `apps/web/src/components/profile/PersonaSection.tsx` 의 native 포팅.
 *
 * UX 정합:
 *   - 활성 페르소나는 accent border + ✓ 체크 표시
 *   - 비-default + 비활성 페르소나는 삭제 버튼 노출
 *   - 최대 3개 (MAX_PERSONAS) 도달 시 생성 버튼 → 안내 문구로 대체
 *
 * 생성 UI 차이:
 *   web 은 `NewPersonaSheet` (mini search + trending grid + posters) — 큰 sheet.
 *   native 는 **minimal**: 이름 + 초기 작품 (저장 목록에서 3개 이상 선택) 패턴 대신,
 *   외부 디자인 팀 의뢰 영역 회피 정책에 따라 **이름만 입력하는 Alert 프롬프트**
 *   (favorites 는 빈 배열로 시작). 사용자가 페르소나의 콘텐츠 신호를 채우려면 saved
 *   바탕으로 추후 채우는 흐름 (W6+ 디자인 확정 후 풍부한 UI 로 교체).
 *
 * state owner: 부모 (`profile.tsx`) — props 콜백으로 위임. 생성 모달만 본 컴포넌트 보유.
 */

interface PersonaSectionProps {
  personas: Persona[];
  activePersonaId: string;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: (name: string) => void;
}

const MAX_PERSONAS = 3;

export default function PersonaSection({
  personas,
  activePersonaId,
  onSwitch,
  onDelete,
  onCreate,
}: PersonaSectionProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [draftName, setDraftName] = useState('');

  function handleDeletePress(id: string, name: string) {
    Alert.alert(
      `'${name}' 취향 삭제`,
      '이 취향에 연결된 5픽은 사라져요. 저장한 작품과 시청 기록은 그대로 유지돼요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => onDelete(id) },
      ],
    );
  }

  function handleCreateSubmit() {
    const trimmed = draftName.trim();
    if (trimmed.length === 0) return;
    onCreate(trimmed);
    setDraftName('');
    setShowCreate(false);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>취향</Text>

      {personas.map((p) => {
        const isActive = p.id === activePersonaId;
        const canDelete = !isActive && p.id !== 'default';
        const favoritesLabel =
          p.favorites.length > 0
            ? p.favorites.slice(0, 3).join(', ') +
              (p.favorites.length > 3 ? ` 외 ${p.favorites.length - 3}편` : '')
            : '아직 5픽이 없어요';
        return (
          <Pressable
            key={p.id}
            onPress={() => {
              if (!isActive) onSwitch(p.id);
            }}
            style={({ pressed }) => [
              styles.personaRow,
              isActive
                ? styles.personaRowActive
                : styles.personaRowInactive,
              pressed && !isActive && styles.personaRowPressed,
            ]}
          >
            <View style={styles.personaBody}>
              <Text
                style={[
                  styles.personaName,
                  isActive && styles.personaNameActive,
                ]}
              >
                {p.name}
              </Text>
              <Text style={styles.personaFavorites} numberOfLines={1}>
                {favoritesLabel}
              </Text>
            </View>
            {isActive ? (
              <Text style={styles.activeMark}>✓</Text>
            ) : canDelete ? (
              <Pressable
                onPress={() => handleDeletePress(p.id, p.name)}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.deleteBtn,
                  pressed && styles.deleteBtnPressed,
                ]}
              >
                <IconClose size={12} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </Pressable>
        );
      })}

      {personas.length < MAX_PERSONAS ? (
        <Pressable
          onPress={() => setShowCreate(true)}
          style={({ pressed }) => [
            styles.createBtn,
            pressed && styles.createBtnPressed,
          ]}
        >
          <Text style={styles.createBtnText}>+ 새 취향 추가</Text>
        </Pressable>
      ) : (
        <Text style={styles.maxNotice}>최대 3개까지 만들 수 있어요</Text>
      )}

      <Modal
        visible={showCreate}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreate(false)}
      >
        {/* backdrop 와 modalCard 를 형제로 분리 (FAIL-J) — backdrop Pressable 이
            카드 콘텐츠(TextInput/취소/추가)를 a11y 트리에서 흡수하지 않도록.
            modalCard 가 backdrop 위에 렌더돼 카드 영역 탭은 backdrop 로 전파 안 됨. */}
        <View style={styles.modalRoot} accessible={false}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowCreate(false)}
            accessibilityRole="button"
            accessibilityLabel="새 취향 추가 닫기"
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>새 취향 추가</Text>
            <Text style={styles.modalDesc}>
              이름을 정해주세요. 작품은 저장 후에 채울 수 있어요.
            </Text>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder="이 취향의 이름은?"
              placeholderTextColor={colors.textMuted}
              maxLength={12}
              style={styles.modalInput}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateSubmit}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setDraftName('');
                  setShowCreate(false);
                }}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnCancel,
                  pressed && styles.modalBtnPressed,
                ]}
              >
                <Text style={styles.modalBtnCancelText}>취소</Text>
              </Pressable>
              <Pressable
                onPress={handleCreateSubmit}
                disabled={draftName.trim().length === 0}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnConfirm,
                  draftName.trim().length === 0 && styles.modalBtnDisabled,
                  pressed && styles.modalBtnPressed,
                ]}
              >
                <Text
                  style={[
                    styles.modalBtnConfirmText,
                    draftName.trim().length === 0 &&
                      styles.modalBtnConfirmTextDisabled,
                  ]}
                >
                  추가
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm + 4,
  },
  personaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.xs + 2,
  },
  personaRowActive: {
    borderColor: colors.accentBorder,
  },
  personaRowInactive: {
    borderColor: colors.borderSubtle,
  },
  personaRowPressed: {
    opacity: 0.7,
  },
  personaBody: { flex: 1, gap: 2 },
  personaName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  personaNameActive: {
    color: colors.accent,
  },
  personaFavorites: {
    color: colors.textMuted,
    fontSize: 12,
  },
  activeMark: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.dangerDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnPressed: {
    opacity: 0.7,
  },
  deleteBtnText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  createBtn: {
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  createBtnPressed: {
    opacity: 0.7,
  },
  createBtnText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  maxNotice: {
    color: colors.textMuted,
    fontSize: 11,
    paddingHorizontal: 4,
    marginTop: spacing.xs,
  },
  // create modal — minimal anti-slop. Profile reset 모달과 일관된 패턴.
  modalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontFamily: fonts.display,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  modalDesc: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  modalInput: {
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    color: colors.textPrimary,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnPressed: {
    opacity: 0.85,
  },
  modalBtnCancel: {
    backgroundColor: colors.surface,
  },
  modalBtnCancelText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  modalBtnConfirm: {
    backgroundColor: colors.accent,
  },
  modalBtnDisabled: {
    backgroundColor: colors.surface,
  },
  modalBtnConfirmText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '600',
  },
  modalBtnConfirmTextDisabled: {
    color: colors.textMuted,
  },
});

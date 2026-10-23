import copy
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'outputs'/'learning-grove'))
scratch=tempfile.TemporaryDirectory(prefix='pocket-check-',dir=ROOT/'work')
os.environ['GROVE_DATA_DIR']=scratch.name
import server


class Pocket(unittest.TestCase):
    def setUp(self):
        server.load()
        self.state=server.initial_state()
        server.action(self.state,{'type':'demo'})
        self.tree=self.state['trees'][0]
        self.node=self.tree['nodes'][0]

    def run_action(self,kind,**kw):
        return server.action(self.state,dict(type=kind,tree_id=self.tree['id'],node_id=self.node['id'],**kw))

    def test_progress_is_read_not_mastery_and_survives_restart(self):
        with self.assertRaises(ValueError):self.run_action('advance')
        self.run_action('set_page',page=len(self.node['cards'])-1)
        result=self.run_action('advance')
        self.assertEqual(self.node['status'],'read')
        self.assertEqual(result['next_node_id'],self.tree['nodes'][1]['id'])
        self.assertIn('尚未经过独立测评',self.state['memories'][-1]['content'])
        server.save(self.state)
        restored=server.load()['trees'][0]['nodes'][0]
        self.assertEqual(restored['page'],2)
        self.assertEqual(restored['status'],'read')
        self.run_action('advance')
        self.assertEqual(len([m for m in self.state['memories'] if m.get('key','').endswith(':read')]),1)

    def test_card_association_and_wrong_card_rejected(self):
        for card in self.node['cards'][:2]:
            self.run_action('chat',card_id=card['id'],message='这张怎么理解？')
        self.assertEqual([m['card_id'] for m in self.node['messages']],[self.node['cards'][0]['id']]*2+[self.node['cards'][1]['id']]*2)
        with self.assertRaises(ValueError):self.run_action('chat',card_id='not-this-card',message='测试')

    def test_old_first_card_retrieved_beyond_recent_history(self):
        first,second=self.node['cards'][:2]
        self.run_action('chat',card_id=first['id'],message='第一张的函数规则，是说每个输入只有一个输出吗？')
        for i in range(9):self.run_action('chat',card_id=second['id'],message='第二张案例的补问'+str(i))
        self.tree['demo']=False
        captured={}
        def model(skill,context):
            captured.update(context)
            return {'answer':'结合第一张的唯一输出规则理解。','memories':[]}
        with patch.object(server,'ask',model):
            self.run_action('chat',card_id=second['id'],message='第一张的问题和这一页有什么联系？')
        self.assertNotIn(first['id'],[m.get('card_id') for m in captured['history']])
        self.assertEqual(captured['related_learning_records'][0]['card_id'],first['id'])
        self.assertIn('唯一',captured['related_learning_records'][0]['messages'][1]['content'])
        self.assertEqual(captured['current_card']['id'],second['id'])

    def test_related_other_node_retrieved_with_source(self):
        self.run_action('chat',card_id=self.node['cards'][0]['id'],message='我对函数输入与输出对应规则的唯一性有疑问。')
        other=self.tree['nodes'][1]
        records=server.related_learning(self.state,self.tree,other,other['cards'][0],'函数输入与输出对应规则的唯一性，之前怎么说的？')
        self.assertEqual(records[0]['node_id'],self.node['id'])
        self.assertEqual(records[0]['tree_title'],self.tree['title'])

    def test_user_marked_done_remains_done(self):
        self.node['status']='done'
        self.node['page']=2
        self.run_action('advance')
        self.assertEqual(self.node['status'],'done')

if __name__=='__main__':
    try:unittest.main()
    finally:scratch.cleanup()
